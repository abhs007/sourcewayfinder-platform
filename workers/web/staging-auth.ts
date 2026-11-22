import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError, type SecurityEnv } from '../control/auth';
export interface StagingSecurity extends SecurityEnv {
  ENVIRONMENT: string;
  STAGING_CHECK_CLIENT_ID?: string;
}
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
// Service-token JWT common_name is the Client ID; sub is empty. This identity
// is admitted only to read-only staging smoke routes, never administrative APIs.
export async function authenticateStaging(request: Request, env: StagingSecurity) {
  if (
    env.ENVIRONMENT !== 'staging' ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || '') ||
    !env.ACCESS_AUD ||
    !env.ADMIN_EMAIL
  )
    throw new HttpError(503, 'AUTH_UNCONFIGURED', 'Staging authentication is not configured.');
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) throw new HttpError(401, 'AUTH_REQUIRED', 'Sign in to staging.');
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  let jwks = keys.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keys.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(assertion, jwks, {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'type'],
    });
    if (payload.type !== 'app') throw Error('token type');
    if (
      typeof payload.sub === 'string' &&
      payload.sub.length > 0 &&
      payload.email === env.ADMIN_EMAIL
    )
      return { kind: 'human' as const };
    const path = new URL(request.url).pathname;
    const allowedPath =
      path === '/' ||
      path === '/api/survey/status' ||
      /^\/api\/v1\/(domains|flows\/[a-z0-9_-]+|sources\/[a-z0-9_-]+)$/.test(path) ||
      path.startsWith('/assets/');
    if (
      payload.sub === '' &&
      payload.email === undefined &&
      env.STAGING_CHECK_CLIENT_ID &&
      payload.common_name === env.STAGING_CHECK_CLIENT_ID &&
      ['GET', 'HEAD'].includes(request.method) &&
      allowedPath
    )
      return { kind: 'synthetic' as const };
    throw Error('principal or operation');
  } catch {
    throw new HttpError(
      403,
      'IDENTITY_REJECTED',
      'This identity cannot perform that staging operation.',
    );
  }
}
