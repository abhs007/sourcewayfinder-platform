import { describe, it, expect, vi } from 'vitest';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import web from '../workers/web/index';
import { validateRedirectSources } from '../ops/validate-assets.mjs';

describe('Workers static asset routing', () => {
  it('rejects absolute and protocol-relative source rules, but permits external destinations', () => {
    expect(() =>
      validateRedirectSources(
        'https://www.sourcewayfinder.org/* https://sourcewayfinder.org/:splat 301',
      ),
    ).toThrow('relative path');
    expect(() => validateRedirectSources('//www.sourcewayfinder.org/* /:splat 301')).toThrow(
      'relative path',
    );
    expect(() =>
      validateRedirectSources('# comment\n\n/old/* https://example.org/:splat 301\n'),
    ).not.toThrow();
  });
  it('keeps the checked-in asset rules valid for Workers uploads', async () => {
    const text = await readFile('apps/web/public/_redirects', 'utf8');
    expect(() => validateRedirectSources(text)).not.toThrow();
  });
  it('redirects the www host once, preserving path and query, while the canonical host serves assets', async () => {
    const assets = vi.fn(async () => new Response('asset'));
    const env = { ENVIRONMENT: 'production', ASSETS: { fetch: assets } } as unknown as Parameters<
      typeof web.fetch
    >[1];
    const response = await web.fetch(
      new Request('https://www.sourcewayfinder.org/survey.html?from=community'),
      env,
    );
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe(
      'https://sourcewayfinder.org/survey.html?from=community',
    );
    expect(assets).not.toHaveBeenCalled();
    const canonical = await web.fetch(new Request(response.headers.get('Location')!), env);
    expect(canonical.status).toBe(200);
    expect(await canonical.text()).toBe('asset');
    expect(assets).toHaveBeenCalledTimes(1);
  });
  it('refuses unauthenticated staging assets before any redirect or asset fetch', async () => {
    const assets = vi.fn(async () => new Response('asset'));
    const env = {
      ENVIRONMENT: 'staging',
      ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
      ACCESS_AUD: 'fixture',
      ADMIN_EMAIL: 'owner@example.test',
      ASSETS: { fetch: assets },
    } as unknown as Parameters<typeof web.fetch>[1];
    const response = await web.fetch(new Request('https://staging.sourcewayfinder.org/'), env);
    expect(response.status).toBe(401);
    expect(assets).not.toHaveBeenCalled();
  });
  it('generates web configurations that run hostname handling before static assets in both environments', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'swf-routing-test-'));
    try {
      const account = JSON.parse(await readFile('infra/cloudflare/staging-account.json', 'utf8'));
      account.production = { ...account.staging };
      await writeFile(resolve(root, 'account.json'), JSON.stringify(account));
      execFileSync(
        process.execPath,
        [resolve('ops/cloudflare-config.mjs'), resolve(root, 'account.json')],
        { cwd: root },
      );
      for (const stage of ['staging', 'production']) {
        const config = JSON.parse(
          await readFile(resolve(root, `infra/cloudflare/${stage}-web.json`), 'utf8'),
        );
        expect(config.assets.run_worker_first).toBe(true);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
