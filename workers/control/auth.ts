import { createRemoteJWKSet, jwtVerify } from 'jose';
import { sha256 } from '../../packages/core/index.js';

export interface SecurityEnv {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ADMIN_EMAIL: string;
  ADMIN_ORIGIN: string;
  CSRF_SECRET: string;
  WORKER_CREDENTIALS_JSON: string;
}
export interface Actor {
  kind: 'human' | 'service';
  id: string;
  scopes: string[];
}
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const enc = new TextEncoder();
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
async function signature(secret: string, payload: string): Promise<string> {
  if (secret.length < 32)
    throw new HttpError(503, 'AUTH_UNCONFIGURED', 'Administration is not configured.');
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload))));
}
export function equalConstantTime(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export async function csrfToken(actor: Actor, env: SecurityEnv, now = Date.now()): Promise<string> {
  const expires = Math.floor(now / 1000) + 7200;
  const payload = `${actor.id}:${expires}`;
  return `${expires}.${await signature(env.CSRF_SECRET, payload)}`;
}
export async function verifyCsrf(
  request: Request,
  actor: Actor,
  env: SecurityEnv,
  now = Date.now(),
): Promise<void> {
  if (request.headers.get('Origin') !== env.ADMIN_ORIGIN)
    throw new HttpError(403, 'ORIGIN_REJECTED', 'Use the review dashboard.');
  const token = request.headers.get('X-CSRF-Token') || '';
  const [expiry, sig, ...extra] = token.split('.');
  if (
    extra.length ||
    !/^\d{10}$/.test(expiry || '') ||
    Number(expiry) * 1000 < now ||
    Number(expiry) * 1000 > now + 7201000 ||
    !sig
  )
    throw new HttpError(403, 'CSRF_REJECTED', 'Reload the review dashboard before submitting.');
  if (!equalConstantTime(sig, await signature(env.CSRF_SECRET, `${actor.id}:${expiry}`)))
    throw new HttpError(403, 'CSRF_REJECTED', 'Reload the review dashboard before submitting.');
}
export async function authenticateHuman(request: Request, env: SecurityEnv): Promise<Actor> {
  if (
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || '') ||
    !env.ACCESS_AUD ||
    !env.ADMIN_EMAIL
  )
    throw new HttpError(503, 'AUTH_UNCONFIGURED', 'Administration is not configured.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new HttpError(401, 'AUTH_REQUIRED', 'Sign in to review this material.');
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  let keys = jwks.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwks.set(issuer, keys);
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'iat', 'email'],
    });
    if (typeof payload.sub !== 'string' || payload.email !== env.ADMIN_EMAIL)
      throw Error('principal');
    return { kind: 'human', id: payload.sub, scopes: ['human:review'] };
  } catch {
    throw new HttpError(
      403,
      'IDENTITY_REJECTED',
      'This identity cannot administer SourceWayfinder.',
    );
  }
}
export async function authenticateService(request: Request, env: SecurityEnv): Promise<Actor> {
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer [A-Za-z0-9_.~-]{32,512}$/.test(authorization))
    throw new HttpError(401, 'SERVICE_AUTH_REQUIRED', 'A service credential is required.');
  let credentials: unknown;
  try {
    credentials = JSON.parse(env.WORKER_CREDENTIALS_JSON || '[]');
  } catch {
    throw new HttpError(503, 'AUTH_UNCONFIGURED', 'Service authentication is not configured.');
  }
  if (!Array.isArray(credentials))
    throw new HttpError(503, 'AUTH_UNCONFIGURED', 'Service authentication is not configured.');
  const hash = await sha256(authorization.slice(7));
  for (const c of credentials) {
    if (
      c &&
      typeof c === 'object' &&
      typeof c.sha256 === 'string' &&
      equalConstantTime(c.sha256, hash) &&
      c.enabled === true &&
      typeof c.id === 'string' &&
      Array.isArray(c.scopes) &&
      c.scopes.every((s: unknown) => typeof s === 'string') &&
      typeof c.expiresAt === 'string' &&
      Date.parse(c.expiresAt) > Date.now()
    )
      return { kind: 'service', id: c.id, scopes: c.scopes };
  }
  throw new HttpError(403, 'SERVICE_AUTH_REJECTED', 'Service credential expired or unauthorized.');
}
export function requireScope(actor: Actor, scope: string): void {
  if (actor.kind !== 'service' || !actor.scopes.includes(scope))
    throw new HttpError(403, 'SCOPE_REJECTED', 'This service cannot perform that operation.');
}
export function requireHuman(actor: Actor): void {
  if (actor.kind !== 'human')
    throw new HttpError(403, 'HUMAN_REQUIRED', 'A human review is required.');
}
