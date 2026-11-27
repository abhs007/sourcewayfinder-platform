import {
  digest,
  effectiveStatus,
  evaluate,
  randomToken,
  sha256,
  validateBundle,
  parseStrictJSON,
  type Answer,
  type Bundle,
  type FlowSummary,
  type Source,
} from '../../packages/core/index';

interface PublishedContent {
  listFlows(): Promise<FlowSummary[]>;
  getFlow(id: string): Promise<FlowSummary | null>;
  getBundle(hash: string): Promise<Bundle | null>;
  getSources(ids: string[]): Promise<Source[]>;
}
export interface Env {
  SESSIONS_DB: D1Database;
  CONTENT: PublishedContent;
  ENVIRONMENT: string;
  PUBLIC_ORIGIN: string;
  GUIDANCE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
}
type Session = {
  id: string;
  token_hash: string;
  flow_id: string;
  bundle_hash: string;
  epoch: number;
  sequence: number;
  answers: string;
  created_at: number;
  last_answer_at: number;
  expires_at: number;
  last_key: string | null;
};
const idle = 30 * 60 * 1000,
  hard = 2 * 60 * 60 * 1000;
class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly officialUrl?: string,
  ) {
    super(message);
  }
}
const error = (status: number, code: string, message: string, officialUrl?: string): never => {
  throw new HttpError(status, code, message, officialUrl);
};
async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    error(415, 'JSON_REQUIRED', 'Send JSON.');
  if (Number(request.headers.get('content-length')) > 8192)
    error(413, 'BODY_TOO_LARGE', 'The request is too large.');
  const reader = request.body?.getReader();
  if (!reader) return error(400, 'INVALID_INPUT', 'A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > 8192) {
      await reader.cancel();
      return error(413, 'BODY_TOO_LARGE', 'The request is too large.');
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    const v = parseStrictJSON(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error();
    return v as Record<string, unknown>;
  } catch {
    return error(400, 'INVALID_INPUT', 'Send a valid JSON object without duplicate keys.');
  }
}
function exactKeys(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).sort().join() !== keys.sort().join())
    error(400, 'INVALID_INPUT', 'Unexpected or missing request fields.');
}
async function flow(env: Env, id: string) {
  const f = await env.CONTENT.getFlow(id);
  if (!f) error(404, 'NOT_FOUND', 'This procedure was not found.');
  return f!;
}
function available(f: FlowSummary, now: number) {
  if (effectiveStatus(f, now) !== 'active' || !f.bundleHash)
    error(
      423,
      'FLOW_UNDER_REVIEW',
      'This guidance is under review. Please use the official source.',
      f.officialUrl,
    );
}
async function loadBundle(env: Env, f: FlowSummary, hash: string) {
  const b = await env.CONTENT.getBundle(hash);
  if (!b || b.flowId !== f.id)
    error(503, 'CONTENT_UNAVAILABLE', 'Guidance is temporarily unavailable.', f.officialUrl);
  if (env.ENVIRONMENT === 'production' && b!.usage !== 'production_candidate')
    error(503, 'CONTENT_UNAVAILABLE', 'Guidance is temporarily unavailable.', f.officialUrl);
  return validateBundle(b);
}
async function session(env: Env, id: string, request: Request, now: number) {
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [a-f0-9]{64}$/.test(authorization))
    error(401, 'SESSION_UNAUTHORIZED', 'This session is not authorized.');
  const s = await env.SESSIONS_DB.prepare('SELECT * FROM sessions WHERE id=? AND token_hash=?')
    .bind(id, await sha256(authorization.slice(7)))
    .first<Session>();
  if (!s) error(401, 'SESSION_UNAUTHORIZED', 'This session is not authorized.');
  if (now >= s!.expires_at || now - s!.last_answer_at >= idle)
    error(410, 'SESSION_EXPIRED', 'Your session expired. Start again.');
  return s!;
}
function payload(s: Session, b: Bundle, f: FlowSummary) {
  return {
    sessionId: s.id,
    flowId: s.flow_id,
    sequence: s.sequence,
    bundleHash: s.bundle_hash,
    statusEpoch: s.epoch,
    step: evaluate(b, JSON.parse(s.answers) as Answer[]),
    sources: b.sources.map((x) => ({ id: x.id, url: x.url, title: x.title ?? 'Official source' })),
    officialUrl: f.officialUrl,
  };
}
export async function handle(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const requestId = crypto.randomUUID(),
    traceId = request.headers.get('X-SWF-Trace-ID')?.match(/^[a-f0-9-]{36}$/)?.[0] ?? requestId,
    started = performance.now();
  let status = 500,
    code = 'INTERNAL_ERROR';
  const json = (body: unknown, s = 200) => {
    status = s;
    return new Response(JSON.stringify(body), {
      status: s,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Request-ID': requestId,
      },
    });
  };
  try {
    const u = new URL(request.url),
      method = request.method;
    if (u.pathname === '/healthz' && method === 'GET') return json({ status: 'ok' });
    if (!['GET', 'POST', 'DELETE'].includes(method))
      error(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');
    const origin = request.headers.get('origin');
    if (origin && origin !== env.PUBLIC_ORIGIN)
      error(403, 'ORIGIN_DENIED', 'Use SourceWayfinder to submit answers.');
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      error(403, 'ORIGIN_DENIED', 'Cross-site requests are not accepted.');
    if (env.GUIDANCE_LIMITER) {
      if (
        !(
          await env.GUIDANCE_LIMITER.limit({
            key: request.headers.get('cf-connecting-ip') ?? 'unknown',
          })
        ).success
      )
        error(429, 'RATE_LIMITED', 'Please wait before trying again.');
    } else if (env.ENVIRONMENT === 'production')
      error(503, 'LIMITER_UNAVAILABLE', 'Guidance is temporarily unavailable.');
    if (u.pathname === '/api/v1/domains' && method === 'GET')
      return json({
        domains: (await env.CONTENT.listFlows()).map((f) => ({
          ...f,
          status: effectiveStatus(f, now),
        })),
      });
    const fm = /^\/api\/v1\/flows\/([a-z0-9_-]+)$/.exec(u.pathname);
    if (fm && method === 'GET') {
      const f = await flow(env, fm[1]!);
      return json({ ...f, status: effectiveStatus(f, now) });
    }
    const source = /^\/api\/v1\/sources\/([a-z0-9_-]+)$/.exec(u.pathname);
    if (source && method === 'GET') {
      const sources = await env.CONTENT.getSources([source[1]!]);
      if (!sources.length) error(404, 'NOT_FOUND', 'This source was not found.');
      return json({ sources });
    }
    if (u.pathname === '/api/v1/sessions' && method === 'POST') {
      const body = await readBody(request);
      exactKeys(body, ['flowId', 'locale']);
      if (typeof body.flowId !== 'string' || body.locale !== 'en')
        error(400, 'INVALID_INPUT', 'Choose a supported procedure and language.');
      const f = await flow(env, body.flowId as string);
      available(f, now);
      const b = await loadBundle(env, f, f.bundleHash!);
      const token = randomToken();
      const s: Session = {
        id: crypto.randomUUID(),
        token_hash: await sha256(token),
        flow_id: f.id,
        bundle_hash: f.bundleHash!,
        epoch: f.statusEpoch,
        sequence: 0,
        answers: '[]',
        created_at: now,
        last_answer_at: now,
        expires_at: now + hard,
        last_key: null,
      };
      await env.SESSIONS_DB.prepare(
        'INSERT INTO sessions (id,token_hash,flow_id,bundle_hash,epoch,sequence,answers,created_at,last_answer_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
        .bind(
          s.id,
          s.token_hash,
          s.flow_id,
          s.bundle_hash,
          s.epoch,
          0,
          '[]',
          now,
          now,
          s.expires_at,
        )
        .run();
      const fresh = await flow(env, f.id);
      available(fresh, now);
      if (fresh.statusEpoch !== f.statusEpoch || fresh.bundleHash !== f.bundleHash)
        error(409, 'FLOW_CHANGED', 'This procedure changed. Start again.', f.officialUrl);
      return json({ ...payload(s, b, f), token }, 201);
    }
    const sm = /^\/api\/v1\/sessions\/([a-f0-9-]+)(\/answers)?$/.exec(u.pathname);
    if (sm) {
      if (method === 'DELETE' && !sm[2]) {
        const token = request.headers.get('authorization') ?? '';
        if (!/^Bearer [a-f0-9]{64}$/.test(token))
          error(401, 'SESSION_UNAUTHORIZED', 'This session is not authorized.');
        await env.SESSIONS_DB.prepare('DELETE FROM sessions WHERE id=? AND token_hash=?')
          .bind(sm[1]!, await sha256(token.slice(7)))
          .run();
        return json({ deleted: true });
      }
      const s = await session(env, sm[1]!, request, now);
      if (method !== 'POST' || !sm[2])
        error(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');
      const f = await flow(env, s.flow_id);
      available(f, now);
      if (f.statusEpoch !== s.epoch || f.bundleHash !== s.bundle_hash)
        error(409, 'FLOW_CHANGED', 'This procedure changed. Start again.', f.officialUrl);
      const body = await readBody(request);
      exactKeys(body, ['questionId', 'choiceId', 'sequence']);
      if (
        typeof body.questionId !== 'string' ||
        typeof body.choiceId !== 'string' ||
        !Number.isSafeInteger(body.sequence) ||
        Number(body.sequence) < 0
      )
        error(400, 'INVALID_INPUT', 'An answer and sequence number are required.');
      const key = request.headers.get('idempotency-key');
      if (!key || !/^[a-zA-Z0-9_-]{8,128}$/.test(key))
        error(400, 'IDEMPOTENCY_REQUIRED', 'A valid retry key is required.');
      const inputHash = await digest(body);
      const prior = await env.SESSIONS_DB.prepare(
        'SELECT input_hash,response FROM submissions WHERE session_id=? AND retry_key=?',
      )
        .bind(s.id, key)
        .first<{ input_hash: string; response: string }>();
      if (prior) {
        if (prior.input_hash !== inputHash)
          error(409, 'RETRY_CONFLICT', 'The retry key belongs to another answer.');
        const latest = await flow(env, f.id);
        available(latest, now);
        if (latest.statusEpoch !== s.epoch || latest.bundleHash !== s.bundle_hash)
          error(409, 'FLOW_CHANGED', 'This procedure changed. Start again.', f.officialUrl);
        return json(JSON.parse(prior.response));
      }
      if (body.sequence !== s.sequence)
        error(409, 'STALE_SEQUENCE', 'This answer is out of sequence.');
      const b = await loadBundle(env, f, s.bundle_hash),
        answers = JSON.parse(s.answers) as Answer[];
      const next = {
        ...s,
        sequence: s.sequence + 1,
        answers: JSON.stringify([
          ...answers,
          { questionId: body.questionId, choiceId: body.choiceId },
        ]),
        last_answer_at: now,
        last_key: key,
      };
      let result: ReturnType<typeof payload>;
      try {
        result = payload(next, b, f);
      } catch {
        error(400, 'INVALID_ANSWER', 'Choose an answer to the current question.');
      }
      await env.SESSIONS_DB.batch([
        env.SESSIONS_DB.prepare(
          'UPDATE sessions SET sequence=?,answers=?,last_answer_at=?,last_key=? WHERE id=? AND sequence=? AND expires_at>? AND last_answer_at>?',
        ).bind(next.sequence, next.answers, now, key, s.id, s.sequence, now, now - idle),
        env.SESSIONS_DB.prepare(
          'INSERT INTO submissions (session_id,retry_key,input_hash,response) SELECT id,?,?,? FROM sessions WHERE id=? AND sequence=? AND last_key=? ON CONFLICT(session_id,retry_key) DO NOTHING',
        ).bind(key, inputHash, JSON.stringify(result!), s.id, next.sequence, key),
      ]);
      const saved = await env.SESSIONS_DB.prepare(
        'SELECT input_hash,response FROM submissions WHERE session_id=? AND retry_key=?',
      )
        .bind(s.id, key)
        .first<{ input_hash: string; response: string }>();
      if (!saved || saved.input_hash !== inputHash)
        error(409, 'STALE_SEQUENCE', 'Another answer was accepted. Start again.');
      const fresh = await flow(env, f.id);
      available(fresh, now);
      if (fresh.statusEpoch !== s.epoch || fresh.bundleHash !== s.bundle_hash)
        error(409, 'FLOW_CHANGED', 'This procedure changed. Start again.', f.officialUrl);
      return json(JSON.parse(saved!.response));
    }
    return error(404, 'NOT_FOUND', 'This endpoint was not found.');
  } catch (e) {
    const known = e instanceof HttpError;
    code = known ? e.code : 'SERVICE_UNAVAILABLE';
    return json(
      {
        code,
        message: known
          ? e.message
          : 'Guidance is temporarily unavailable. Please use the official source.',
        requestId,
        ...(known && e.officialUrl ? { officialUrl: e.officialUrl } : {}),
      },
      known ? e.status : 503,
    );
  } finally {
    console.log(
      JSON.stringify({
        service: 'guidance-api',
        environment: env.ENVIRONMENT,
        requestId,
        traceId,
        status,
        code: status >= 400 ? code : undefined,
        durationMs: Math.round(performance.now() - started),
      }),
    );
  }
}
export default {
  fetch: (request: Request, env: Env) => handle(request, env),
  async scheduled(_event: ScheduledEvent, env: Env) {
    const now = Date.now();
    await env.SESSIONS_DB.prepare(
      'DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at<=? OR last_answer_at<=? LIMIT 1000)',
    )
      .bind(now, now - idle)
      .run();
  },
};
