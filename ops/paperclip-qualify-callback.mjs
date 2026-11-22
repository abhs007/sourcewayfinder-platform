// Execute inside the qualified controller with its installed tsx loader.
// stdin contains the private SSH spec; it is never logged.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  startAdapterExecutionTargetPaperclipBridge,
  runAdapterExecutionTargetShellCommand,
} from '/app/packages/adapter-utils/src/execution-target.ts';
const spec = JSON.parse(readFileSync(0, 'utf8'));
const target = {
  kind: 'remote',
  transport: 'ssh',
  remoteCwd: spec.remoteWorkspacePath,
  spec: { ...spec, remoteCwd: spec.remoteWorkspacePath },
};
const runId = randomUUID();
if (process.env.PAPERCLIP_AGENT_CALLBACK_UPSTREAM !== 'http://egress:8081')
  throw Error('Callback gateway not configured');
const bridge = await startAdapterExecutionTargetPaperclipBridge({
  runId,
  target,
  runtimeRootDir: spec.remoteWorkspacePath + '/.qualification-bridge',
  adapterKey: 'codex',
  timeoutSec: 60,
  hostApiToken: 'fictional-denial-probe',
  hostApiUrl: process.env.PAPERCLIP_AGENT_CALLBACK_UPSTREAM,
});
if (!bridge) throw Error('No actual remote callback relay created');
try {
  const script = `import json, urllib.request, urllib.error
base=${JSON.stringify(bridge.env.PAPERCLIP_API_URL)}
token=${JSON.stringify(bridge.env.PAPERCLIP_API_KEY)}
codes=[]
for method,path in [('PATCH','/api/agents/00000000-0000-0000-0000-000000000000'),('POST','/api/approvals/00000000-0000-0000-0000-000000000000/approve')]:
 request=urllib.request.Request(base+path,data=b'{}',method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 try:
  response=urllib.request.urlopen(request,timeout=30);codes.append(response.status)
 except urllib.error.HTTPError as error:codes.append(error.code)
print(json.dumps({'callbackMode':'queue_v1','configurationStatus':codes[0],'approvalStatus':codes[1]}))
assert codes==[403,403]
`;
  const quoted = "'" + script.replaceAll("'", "'\"'\"'") + "'";
  const result = await runAdapterExecutionTargetShellCommand(
    runId,
    target,
    'python3 -c ' + quoted,
    { cwd: spec.remoteWorkspacePath, env: {}, timeoutSec: 60 },
  );
  if (result.exitCode !== 0)
    throw Error('Actual callback permission denial failed: ' + result.stderr.slice(-500));
  console.log(result.stdout.trim());
} finally {
  await bridge.stop();
}
