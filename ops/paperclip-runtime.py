#!/usr/bin/env python3
"""Prepare and operate the dedicated local runtime; never print secrets."""
import argparse, difflib, hashlib, json, os, pathlib, secrets, shlex, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'private/runtime'
SHA = '7671e0cf0d718351f3b0c4d6a7d33df9867ffb8a'
NODE = 'node:24-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0'
DOCKER = ['docker', '--context', 'colima-sourcewayfinder']

def run(args, **kw):
    return subprocess.run(args, check=True, cwd=ROOT, **kw)

def compose(*args):
    env = dict(os.environ, DOCKER_CONTEXT='colima-sourcewayfinder')
    return run(['docker-compose', '--env-file', str(PRIVATE/'.env'), '-f',
                str(ROOT/'infra/paperclip/compose.yaml'), *args], env=env)

def load_approved_vm_profile():
    approved={'codex-apparmor.profile':'97ac6efd470fe80afc076b1b242a2136ab585f32953927a8f31a1befdad55283',
              'codex-seccomp.json':'4edc3a1b7a145f169ea451a6b8212494537e886a490ad00af64433ff67e402e9'}
    for name,digest in approved.items():
        if hashlib.sha256((ROOT/'infra/paperclip'/name).read_bytes()).hexdigest()!=digest:
            raise RuntimeError('VM security policy changed; explicit review required before loading')
    run(['colima','ssh','--profile','sourcewayfinder','--','sudo','tee','/etc/apparmor.d/sourcewayfinder-codex'],
        input=(ROOT/'infra/paperclip/codex-apparmor.profile').read_bytes(),stdout=subprocess.DEVNULL)
    run(['colima','ssh','--profile','sourcewayfinder','--','sudo','apparmor_parser','-r','/etc/apparmor.d/sourcewayfinder-codex'])

def prepare():
    PRIVATE.mkdir(parents=True, exist_ok=True); PRIVATE.chmod(0o700)
    (PRIVATE/'build-logs').mkdir(exist_ok=True)
    env = PRIVATE/'.env'
    if not env.exists():
        env.write_text('COMPOSE_PROJECT_NAME=sourcewayfinder\n' + ''.join(
            k+'='+secrets.token_hex(32)+'\n' for k in
            ('POSTGRES_PASSWORD','BETTER_AUTH_SECRET','TOOL_ACTION_SIGNING_SECRET')))
    env.chmod(0o600)
    key = PRIVATE/'agent_ed25519'
    if not key.exists():
        run(['ssh-keygen','-q','-t','ed25519','-N','','-C','sourcewayfinder-controller','-f',str(key)])
    key.chmod(0o600)
    shutil.copyfile(str(key)+'.pub',ROOT/'infra/paperclip/authorized_keys')
    source=PRIVATE/'paperclip'
    if not source.exists(): run(['git','clone','https://github.com/paperclipai/paperclip.git',str(source)])
    run(['git','-C',str(source),'checkout',SHA])
    actual=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
    if actual != SHA: raise RuntimeError('Paperclip revision mismatch')
    raw=(source/'Dockerfile').read_text()
    old='@anthropic-ai/claude-code@latest @openai/codex@latest opencode-ai @google/gemini-cli@latest @moonshot-ai/kimi-code@latest'
    if raw.count(old)!=1: raise RuntimeError('Upstream CLI install changed; review required')
    rendered=raw.replace('FROM node:24-trixie-slim AS base','FROM '+NODE+' AS base').replace(old,'@openai/codex@0.169.1')
    # Pinned remote callback relays otherwise bypass the task-only network gateway
    # via controller loopback. Patch only the active Codex adapter build input.
    original='          hostApiToken: env.PAPERCLIP_API_KEY,\n          onLog,'
    patched='          hostApiToken: env.PAPERCLIP_API_KEY,\n          hostApiUrl: process.env.PAPERCLIP_AGENT_CALLBACK_UPSTREAM,\n          onLog,'
    script='from pathlib import Path; p=Path("packages/adapters/codex-local/src/server/execute.ts"); s=p.read_text(); old='+repr(original)+'; assert s.count(old)==1; p.write_text(s.replace(old,'+repr(patched)+'))'
    marker='COPY --exclude=docker/remote-runtimes . .'
    if raw.count(marker)!=1: raise RuntimeError('Build copy stage changed; review callback overlay')
    rendered=rendered.replace(marker,marker+'\nRUN python3 -c '+shlex.quote(script))
    guest_edits=[
      ('server/src/services/heartbeat/run-preparation.ts','  environmentDriver?: string | null;','  environmentDriver?: string | null;\n  environmentUseHostAuth?: boolean;'),
      ('server/src/services/heartbeat/run-preparation.ts','    (input.environmentDriver ?? null) !== "sandbox"','    (input.environmentDriver ?? null) !== "sandbox" &&\n    !(input.environmentDriver === "ssh" && input.environmentUseHostAuth === true)'),
      ('server/src/services/heartbeat/execution-configuration.ts','      environmentDriver: selectedEnvironmentForConfig?.driver ?? null,','      environmentDriver: selectedEnvironmentForConfig?.driver ?? null,\n      environmentUseHostAuth: selectedEnvironmentForConfig?.driver === "ssh" && parseObject(selectedEnvironmentForConfig.config).useHostAuth === true,'),
    ]
    overlay_run=''
    patch=''
    originals={}
    modified={}
    for file,before,after in guest_edits:
        text=modified.get(file,(source/file).read_text());originals.setdefault(file,text)
        if text.count(before)!=1: raise RuntimeError('Guest auth overlay no longer matches pinned source')
        modified[file]=text.replace(before,after)
        code='from pathlib import Path; p=Path('+repr(file)+'); s=p.read_text(); before='+repr(before)+'; assert s.count(before)==1; p.write_text(s.replace(before,'+repr(after)+'))'
        overlay_run+='\nRUN python3 -c '+shlex.quote(code)
    for file in originals:
        patch+=''.join(difflib.unified_diff(originals[file].splitlines(True),modified[file].splitlines(True),fromfile='a/'+file,tofile='b/'+file))
    (ROOT/'infra/paperclip/ssh-guest-auth.patch').write_text(patch)
    rendered=rendered.replace(marker,marker+overlay_run)
    (PRIVATE/'controller.Dockerfile').write_text(rendered)
    manifest={'sourceCommit':SHA,'codexVersion':'0.169.1','nodeImage':NODE,
              'upstreamDockerfileSha256':hashlib.sha256(raw.encode()).hexdigest(),
              'renderedDockerfileSha256':hashlib.sha256(rendered.encode()).hexdigest()}
    manifest['callbackSecurityOverlay']='codex relay hostApiUrl = operator PAPERCLIP_AGENT_CALLBACK_UPSTREAM; required to prevent gateway bypass'
    manifest['sshGuestAuthOverlaySha256']=hashlib.sha256(patch.encode()).hexdigest()
    (PRIVATE/'build-inputs.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Prepared private credentials and pinned build inputs. No credentials exported.')

def build():
    prepare()
    env=dict(os.environ,DOCKER_CONTEXT='colima-sourcewayfinder')
    buildx='/opt/homebrew/lib/docker/cli-plugins/docker-buildx'
    if not pathlib.Path(buildx).exists(): raise RuntimeError('Install docker-buildx with Homebrew first')
    for name,dockerfile,context,tag,target in (
       ('controller',PRIVATE/'controller.Dockerfile',PRIVATE/'paperclip','sourcewayfinder-paperclip:7671e0c-codex01691',['--target','production']),
       ('agent',ROOT/'infra/paperclip/Agent.Dockerfile',ROOT/'infra/paperclip','sourcewayfinder-agent:codex01691',[]),
       ('egress',ROOT/'infra/paperclip/Proxy.Dockerfile',ROOT/'infra/paperclip','sourcewayfinder-egress:v1',[])):
        with (PRIVATE/'build-logs'/f'{name}.log').open('w') as log:
            run([buildx,'build','--load',*target,'--build-arg','PAPERCLIP_BUILD_COMMIT='+SHA,
                 '-f',str(dockerfile),'-t',tag,str(context)],env=env,stdout=log,stderr=subprocess.STDOUT)
        print(name+' image built')
    with (PRIVATE/'image-manifest.json').open('w') as out:
        run(DOCKER+['image','inspect','sourcewayfinder-paperclip:7671e0c-codex01691',
                    'sourcewayfinder-agent:codex01691','sourcewayfinder-egress:v1'],stdout=out)

def status():
    compose('ps')
    run(DOCKER+['ps','--filter','label=com.docker.compose.project=sourcewayfinder',
                '--format','{{.Names}} {{.Ports}} {{.Status}}'])

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('action',choices=['prepare','vm-start','build','up','stop','status','backup-local'])
    action=parser.parse_args().action
    if action=='prepare': prepare()
    elif action=='vm-start': run(['colima','start','--profile','sourcewayfinder','--cpu','4','--memory','12','--disk','60','--mount','none','--ssh-agent=false'])
    elif action=='build': build()
    elif action=='up':
        load_approved_vm_profile()
        compose('up','-d','--no-build')
    elif action=='stop': compose('stop')
    elif action=='status': status()
    elif action=='backup-local':
        dest=PRIVATE/'backups'; dest.mkdir(exist_ok=True); dest.chmod(0o700)
        name=__import__('datetime').datetime.now(__import__('datetime').timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        file=dest/(name+'.pgdump.partial')
        with file.open('wb') as out:
            run(DOCKER+['exec','sourcewayfinder-db-1','pg_dump','-U','paperclip','-d','paperclip','-Fc'],stdout=out)
        file.chmod(0o600); file.rename(dest/(name+'.pgdump'))
        print('Application-consistent private database dump created. Encrypt with runtime recovery secrets before off-device upload.')
