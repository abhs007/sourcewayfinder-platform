import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import {
  csrfToken,
  verifyCsrf,
  authenticateHuman,
  authenticateService,
  type Actor,
  type SecurityEnv,
} from '../workers/control/auth.js';
import { sha256 } from '../packages/core/index.js';
const env: SecurityEnv = {
  ACCESS_TEAM_DOMAIN: 'policy-test.cloudflareaccess.com',
  ACCESS_AUD: 'test-audience',
  ADMIN_EMAIL: 'owner@example.test',
  ADMIN_ORIGIN: 'https://admin.example.test',
  CSRF_SECRET: 's'.repeat(40),
  WORKER_CREDENTIALS_JSON: '[]',
};
const actor: Actor = { kind: 'human', id: 'test-owner', scopes: [] };
afterEach(() => vi.unstubAllGlobals());
describe('policy authentication', () => {
  it('fails closed without configured Access and rejects missing or fabricated assertions', async () => {
    await expect(
      authenticateHuman(new Request(env.ADMIN_ORIGIN), { ...env, ACCESS_AUD: '' }),
    ).rejects.toMatchObject({ code: 'AUTH_UNCONFIGURED' });
    await expect(authenticateHuman(new Request(env.ADMIN_ORIGIN), env)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    await expect(
      authenticateHuman(
        new Request(env.ADMIN_ORIGIN, { headers: { 'Cf-Access-Jwt-Assertion': 'fabricated' } }),
        env,
      ),
    ).rejects.toMatchObject({ code: 'IDENTITY_REJECTED' });
  });
  it('verifies JWT signature, issuer, audience, expiry and exact authorized email', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256'),
      jwk = await exportJWK(publicKey);
    jwk.kid = 'test-only';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ keys: [jwk] })),
    );
    const issue = async (patch: Record<string, unknown> = {}) =>
      new SignJWT({ email: env.ADMIN_EMAIL, ...patch })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-only' })
        .setSubject('test-owner')
        .setIssuedAt()
        .setIssuer(env.ADMIN_ORIGIN.replace('admin.example.test', env.ACCESS_TEAM_DOMAIN))
        .setAudience(env.ACCESS_AUD)
        .setExpirationTime('5m')
        .sign(privateKey);
    const request = (token: string) =>
      new Request(env.ADMIN_ORIGIN, { headers: { 'Cf-Access-Jwt-Assertion': token } });
    expect((await authenticateHuman(request(await issue()), env)).id).toBe('test-owner');
    await expect(
      authenticateHuman(request(await issue({ email: 'attacker@example.test' })), env),
    ).rejects.toMatchObject({ code: 'IDENTITY_REJECTED' });
    await expect(
      authenticateHuman(request(await issue()), { ...env, ACCESS_AUD: 'different-audience' }),
    ).rejects.toMatchObject({ code: 'IDENTITY_REJECTED' });
    const expired = await new SignJWT({ email: env.ADMIN_EMAIL })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-only' })
      .setSubject('test-owner')
      .setIssuedAt()
      .setIssuer(`https://${env.ACCESS_TEAM_DOMAIN}`)
      .setAudience(env.ACCESS_AUD)
      .setExpirationTime(1)
      .sign(privateKey);
    await expect(authenticateHuman(request(expired), env)).rejects.toMatchObject({
      code: 'IDENTITY_REJECTED',
    });
    const wrongIssuer = await new SignJWT({ email: env.ADMIN_EMAIL })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-only' })
      .setSubject('test-owner')
      .setIssuedAt()
      .setIssuer('https://attacker.example.test')
      .setAudience(env.ACCESS_AUD)
      .setExpirationTime('5m')
      .sign(privateKey);
    await expect(authenticateHuman(request(wrongIssuer), env)).rejects.toMatchObject({
      code: 'IDENTITY_REJECTED',
    });
  });
  it('binds CSRF token to principal, expiration, and exact origin', async () => {
    const now = Date.now(),
      token = await csrfToken(actor, env, now);
    const req = (origin: string) =>
      new Request(env.ADMIN_ORIGIN, {
        method: 'POST',
        headers: { Origin: origin, 'X-CSRF-Token': token },
      });
    await expect(verifyCsrf(req(env.ADMIN_ORIGIN), actor, env, now)).resolves.toBeUndefined();
    await expect(
      verifyCsrf(req('https://attacker.example.test'), actor, env, now),
    ).rejects.toMatchObject({ code: 'ORIGIN_REJECTED' });
    await expect(
      verifyCsrf(req(env.ADMIN_ORIGIN), { ...actor, id: 'different' }, env, now),
    ).rejects.toMatchObject({ code: 'CSRF_REJECTED' });
    await expect(
      verifyCsrf(req(env.ADMIN_ORIGIN), actor, env, now + 7201000),
    ).rejects.toMatchObject({ code: 'CSRF_REJECTED' });
  });
  it('accepts only enabled unexpired scoped credentials and never a human identity from a service token', async () => {
    const token = 'test-token-'.repeat(5),
      config = {
        ...env,
        WORKER_CREDENTIALS_JSON: JSON.stringify([
          {
            id: 'collector',
            sha256: await sha256(token),
            enabled: true,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            scopes: ['source:write'],
          },
        ]),
      };
    const request = new Request(env.ADMIN_ORIGIN, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(await authenticateService(request, config)).toEqual({
      kind: 'service',
      id: 'collector',
      scopes: ['source:write'],
    });
    await expect(authenticateHuman(request, env)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    await expect(
      authenticateService(request, {
        ...config,
        WORKER_CREDENTIALS_JSON: config.WORKER_CREDENTIALS_JSON.replace(
          '"enabled":true',
          '"enabled":false',
        ),
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_AUTH_REJECTED' });
  });
});
