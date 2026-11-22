import { parseStrictJSON } from '../../packages/core/index.js';
import { WorkerEntrypoint } from 'cloudflare:workers';
import {
  authenticateHuman,
  authenticateService,
  csrfToken,
  verifyCsrf,
  requireScope,
  HttpError,
  type SecurityEnv,
} from './auth.js';
import { ControlService, type ControlEnv } from './service.js';

export interface Env extends ControlEnv, SecurityEnv {
  ASSETS?: Fetcher;
  SLACK_WEBHOOK_URL?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_INCIDENT_CHANNEL?: string;
  SLACK_REVIEW_CHANNEL?: string;
  SLACK_RELEASE_CHANNEL?: string;
}
const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
};
const response = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: securityHeaders });
async function body(request: Request): Promise<Record<string, any>> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json'))
    throw new HttpError(415, 'JSON_REQUIRED', 'Use application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'INVALID_BODY', 'JSON body required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 262144) {
      await reader.cancel();
      throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body exceeds 256 KiB.');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  try {
    const value = parseStrictJSON(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value as Record<string, any>;
  } catch {
    throw new HttpError(400, 'INVALID_BODY', 'JSON object required.');
  }
}
export async function handle(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID(),
    start = Date.now();
  let status = 200,
    errorCode: string | undefined;
  const path = new URL(request.url).pathname;
  try {
    const service = new ControlService(env);
    let result: unknown;
    const method = request.method;
    if (path === '/healthz' && method === 'GET')
      return response({ ok: true, service: 'control', environment: env.ENVIRONMENT });
    if (path.startsWith('/admin/v1/')) {
      const actor = await authenticateHuman(request, env);
      if (method !== 'GET') await verifyCsrf(request, actor, env);
      let m: RegExpMatchArray | null;
      if (path === '/admin/v1/dashboard' && method === 'GET')
        result = { ...(await service.dashboard()), csrfToken: await csrfToken(actor, env) };
      else if ((m = path.match(/^\/admin\/v1\/proposals\/([^/]+)$/)) && method === 'GET')
        result = await service.proposal(m[1]);
      else if ((m = path.match(/^\/admin\/v1\/releases\/([^/]+)$/)) && method === 'GET') {
        const release = await service.one('SELECT * FROM releases WHERE id=?', m[1]);
        if (!release) throw new HttpError(404, 'NOT_FOUND', 'Release not found.');
        result = {
          ...release,
          manifest: JSON.parse(release.manifest),
          approvals: await service.all(
            'SELECT * FROM approvals WHERE entity_id=? ORDER BY sequence',
            m[1],
          ),
        };
      } else if (
        (m = path.match(/^\/admin\/v1\/(proposals|releases)\/([^/]+)\/decisions$/)) &&
        method === 'POST'
      )
        result = await service.decision(actor, m[2], await body(request), m[1] === 'releases');
      else if ((m = path.match(/^\/admin\/v1\/flows\/([^/]+)\/status$/)) && method === 'POST')
        result = await service.setStatus(actor, m[1], await body(request));
      else if ((m = path.match(/^\/admin\/v1\/releases\/([^/]+)\/abandon$/)) && method === 'POST')
        result = await service.abandonRuntime(actor, m[1], await body(request));
      else if ((m = path.match(/^\/admin\/v1\/sources\/([^/]+)$/)) && method === 'GET') {
        const source = await service.one('SELECT * FROM source_registry WHERE id=?', m[1]);
        if (!source) throw new HttpError(404, 'NOT_FOUND', 'Source not found.');
        result = {
          ...source,
          latestVersion: await service.one(
            'SELECT * FROM source_versions WHERE id=?',
            source.latest_version_id,
          ),
          observations: await service.all(
            'SELECT * FROM source_observations WHERE source_id=? ORDER BY checked_at DESC LIMIT 20',
            m[1],
          ),
        };
      } else if (path === '/admin/v1/flows' && method === 'POST')
        result = await service.createFlow(actor, await body(request));
      else if ((m = path.match(/^\/admin\/v1\/sources\/([^/]+)\/revalidate$/)) && method === 'POST')
        result = await service.revalidateSource(actor, m[1], await body(request));
      else if (path === '/admin/v1/sources' && method === 'POST')
        result = await service.registerSource(actor, await body(request));
      else throw new HttpError(404, 'NOT_FOUND', 'Administrative route not found.');
    } else if (path.startsWith('/internal/v1/')) {
      const actor = await authenticateService(request, env);
      let m: RegExpMatchArray | null;
      if (path === '/internal/v1/sources' && method === 'GET') {
        requireScope(actor, 'source:write');
        result = {
          sources: await service.all(
            'SELECT id,flow_id,url,title,approved_origin,approved_path,latest_version_id,last_successful_check_at FROM source_registry WHERE enabled=1',
          ),
        };
      } else if (path === '/internal/v1/evidence' && method === 'POST')
        result = await service.reserveEvidence(actor, await body(request));
      else if (
        (m = path.match(/^\/internal\/v1\/evidence\/([^/]+)\/chunks\/(\d+)$/)) &&
        method === 'PUT'
      )
        result = await service.evidenceChunk(actor, m[1], Number(m[2]), await body(request));
      else if (
        (m = path.match(/^\/internal\/v1\/evidence\/([^/]+)\/complete$/)) &&
        method === 'POST'
      )
        result = await service.completeEvidence(actor, m[1]);
      else if (path === '/internal/v1/source-checks' && method === 'POST')
        result = await service.sourceCheck(actor, await body(request));
      else if (path === '/internal/v1/proposals' && method === 'POST')
        result = await service.createProposal(actor, await body(request));
      else if (
        (m = path.match(/^\/internal\/v1\/proposals\/([^/]+)\/(candidate|expectations)$/)) &&
        method === 'POST'
      )
        result =
          m[2] === 'candidate'
            ? await service.candidate(actor, m[1], await body(request))
            : await service.expectations(actor, m[1], await body(request));
      else if (
        (m = path.match(/^\/internal\/v1\/proposals\/([^/]+)\/release-input$/)) &&
        method === 'GET'
      )
        result = await service.releaseInput(actor, m[1]);
      else if (
        (m = path.match(/^\/internal\/v1\/proposals\/([^/]+)\/test-authorization$/)) &&
        method === 'GET'
      )
        result = await service.testAuthorization(actor, m[1]);
      else if (
        (m = path.match(/^\/internal\/v1\/releases\/([^/]+)\/recovery$/)) &&
        method === 'GET'
      )
        result = await service.releaseRecovery(actor, m[1]);
      else if (
        (m = path.match(/^\/internal\/v1\/releases\/([^/]+)\/authorization$/)) &&
        method === 'GET'
      )
        result = await service.releaseAuthorization(actor, m[1]);
      else if (path === '/internal/v1/test-runs' && method === 'POST')
        result = await service.recordTest(actor, await body(request));
      else if (path === '/internal/v1/releases' && method === 'POST')
        result = await service.createRelease(actor, await body(request));
      else if (
        (m = path.match(
          /^\/internal\/v1\/releases\/([^/]+)\/(promote|verify|suspend|recover|suspend-recovery)$/,
        )) &&
        method === 'POST'
      )
        result =
          m[2] === 'promote'
            ? await service.promote(actor, m[1])
            : m[2] === 'suspend'
              ? await service.suspendForRelease(actor, m[1])
              : m[2] === 'suspend-recovery'
                ? await service.suspendForRecovery(actor, m[1])
                : m[2] === 'recover'
                  ? await service.recoverRuntime(actor, m[1], await body(request))
                  : await service.verifyRelease(actor, m[1], await body(request));
      else if ((m = path.match(/^\/internal\/v1\/flows\/([^/]+)\/status$/)) && method === 'POST')
        result = await service.setStatus(actor, m[1], await body(request));
      else if (path === '/internal/v1/jobs/claim' && method === 'POST')
        result = await service.claimJob(actor, await body(request));
      else if ((m = path.match(/^\/internal\/v1\/jobs\/([^/]+)\/finish$/)) && method === 'POST')
        result = await service.finishJob(actor, m[1], await body(request));
      else throw new HttpError(404, 'NOT_FOUND', 'Internal route not found.');
    } else {
      await authenticateHuman(request, env);
      if (env.ASSETS && method === 'GET') {
        const asset = await env.ASSETS.fetch(request),
          secured = new Response(asset.body, asset);
        for (const [key, value] of Object.entries(securityHeaders)) secured.headers.set(key, value);
        secured.headers.set('X-Request-ID', requestId);
        status = secured.status;
        return secured;
      }
      throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
    }
    const res = response(result);
    res.headers.set('X-Request-ID', requestId);
    return res;
  } catch (error) {
    status = error instanceof HttpError ? error.status : 503;
    errorCode = error instanceof HttpError ? error.code : 'SERVICE_UNAVAILABLE';
    const res = response(
      {
        error: {
          code: errorCode,
          message: error instanceof HttpError ? error.message : 'Policy authority is unavailable.',
          requestId,
        },
      },
      status,
    );
    res.headers.set('X-Request-ID', requestId);
    return res;
  } finally {
    console.log(
      JSON.stringify({
        requestId,
        traceId: requestId,
        service: 'control',
        environment: env.ENVIRONMENT,
        durationMs: Date.now() - start,
        status,
        errorCode,
      }),
    );
  }
}
/** This entrypoint deliberately exposes no fetch or policy mutation capability. */
export class PublishedContent extends WorkerEntrypoint<Env> {
  async listFlows() {
    return new ControlService(this.env).flows();
  }
  async getFlow(id: string) {
    return new ControlService(this.env).flow(id);
  }
  async getBundle(hash: string) {
    return new ControlService(this.env).bundle(hash);
  }
  async getSources(ids: string[]) {
    return new ControlService(this.env).sources(ids);
  }
}
async function notify(env: Env) {
  if (!env.SLACK_BOT_TOKEN && !env.SLACK_WEBHOOK_URL) return;
  const service = new ControlService(env),
    entries = await service.all(
      "SELECT * FROM notification_outbox WHERE state='pending' AND attempts<3 ORDER BY created_at LIMIT 5",
    );
  for (const event of entries) {
    try {
      const text = `SourceWayfinder ${event.kind}: ${event.payload}\nReview: ${env.ADMIN_ORIGIN}`;
      let delivered = false;
      if (env.SLACK_BOT_TOKEN) {
        const channel =
          event.kind === 'review_requested'
            ? env.SLACK_REVIEW_CHANNEL
            : event.kind.startsWith('release_') && event.kind !== 'release_failed'
              ? env.SLACK_RELEASE_CHANNEL
              : env.SLACK_INCIDENT_CHANNEL;
        if (!/^[CG][A-Z0-9]{8,}$/.test(channel || ''))
          throw Error('Slack channel is not configured');
        const res = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
          },
          body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
          signal: AbortSignal.timeout(10000),
        });
        delivered = res.ok && ((await res.json()) as { ok?: boolean }).ok === true;
      } else {
        const url = new URL(env.SLACK_WEBHOOK_URL!);
        if (url.protocol !== 'https:' || url.hostname !== 'hooks.slack.com')
          throw Error('Invalid Slack endpoint');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(10000),
        });
        delivered = res.ok;
      }
      await service
        .stmt(
          'UPDATE notification_outbox SET attempts=attempts+1,state=? WHERE id=?',
          delivered ? 'sent' : event.attempts >= 2 ? 'failed' : 'pending',
          event.id,
        )
        .run();
    } catch {
      await service
        .stmt(
          "UPDATE notification_outbox SET attempts=attempts+1,state=CASE WHEN attempts>=2 THEN 'failed' ELSE 'pending' END WHERE id=?",
          event.id,
        )
        .run();
    }
  }
}

export default {
  fetch: handle,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(new ControlService(env).maintenance().then(() => notify(env)));
  },
} satisfies ExportedHandler<Env>;
