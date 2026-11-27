import { it, expect, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { authenticateStaging, type StagingSecurity } from '../workers/web/staging-auth';
it('authenticates a real signed staging service JWT only for its read-only scope', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256'),
    jwk = await exportJWK(publicKey);
  jwk.kid = 'staging-test';
  vi.stubGlobal('fetch', async () => Response.json({ keys: [jwk] }));
  const env: StagingSecurity = {
    ENVIRONMENT: 'staging',
    ACCESS_TEAM_DOMAIN: 'staging-test.cloudflareaccess.com',
    ACCESS_AUD: 'staging-aud',
    ADMIN_EMAIL: 'owner@example.test',
    ADMIN_ORIGIN: 'https://admin.example.test',
    CSRF_SECRET: '',
    WORKER_CREDENTIALS_JSON: '[]',
    STAGING_CHECK_CLIENT_ID: 'smoke.access',
  };
  const token = await new SignJWT({ type: 'app', common_name: 'smoke.access' })
    .setSubject('')
    .setIssuedAt()
    .setIssuer('https://staging-test.cloudflareaccess.com')
    .setAudience('staging-aud')
    .setExpirationTime('5m')
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .sign(privateKey);
  const req = (path: string, method = 'GET') =>
    new Request('https://staging.sourcewayfinder.org' + path, {
      method,
      headers: { 'Cf-Access-Jwt-Assertion': token },
    });
  try {
    expect(await authenticateStaging(req('/api/v1/domains'), env)).toEqual({ kind: 'synthetic' });
    await expect(authenticateStaging(req('/admin/v1/dashboard'), env)).rejects.toMatchObject({
      status: 403,
    });
    await expect(authenticateStaging(req('/api/v1/sessions', 'POST'), env)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      authenticateStaging(req('/'), { ...env, ENVIRONMENT: 'production' }),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      authenticateStaging(req('/'), { ...env, STAGING_CHECK_CLIENT_ID: 'other.access' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      authenticateStaging(req('/'), { ...env, ACCESS_AUD: 'admin-audience' }),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    vi.unstubAllGlobals();
  }
});
