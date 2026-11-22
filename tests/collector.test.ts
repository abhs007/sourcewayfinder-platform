import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isPublicAddress,
  assertBrowserRequest,
  assertSourceUrl,
  assertResponseLength,
  normalizeHtml,
  fetchSource,
  retain,
  immutableWrite,
  MAX_BYTES,
  type SourceConfig,
} from '../ops/collector.mts';
const source: SourceConfig = {
  id: 'fixture',
  flowId: 'fictional',
  url: 'https://example.org/source',
  title: 'Fictional',
  approvedOrigin: 'https://example.org',
  approvedPath: '/source',
  requiredPhrases: ['fictional source'],
};
const html = Buffer.from(
  '<!doctype html><html><body><nav>Ignore navigation</nav><main><h1>Fictional source</h1><p>' +
    'This is an invented source passage used to verify extraction boundaries. '.repeat(3) +
    '</p><script>malicious instructions</script></main></body></html>',
);

describe('source collector boundaries', () => {
  it('rejects local, private, mapped, reserved and tunneling addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.2.3.4',
      '169.254.169.254',
      '172.20.0.1',
      '192.168.1.1',
      '100.64.0.2',
      '192.0.2.1',
      '198.51.100.1',
      '203.0.113.1',
      '224.0.0.1',
      '0.0.0.0',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:8.8.8.8',
      '2001:db8::1',
      '2002:7f00:1::',
      '2001::1',
      '2001:100::1',
      '3fff::1',
      'invalid',
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111'])
      expect(isPublicAddress(ip), ip).toBe(true);
  });
  it('requires exact approved origin and path without credentials or parameters', () => {
    expect(assertSourceUrl(source.url, source).href).toBe(source.url);
    for (const url of [
      'http://example.org/source',
      'https://user@example.org/source',
      'https://example.org.evil.test/source',
      'https://example.org/source/extra',
      'https://example.org/source?override=1',
      'https://example.org/source#part',
      'https://example.org:444/source',
      'https://127.0.0.1/source',
    ])
      expect(() => assertSourceUrl(url, source)).toThrow();
  });
  it('rejects an unsafe redirect before transport can contact its destination', async () => {
    let calls = 0;
    await expect(
      fetchSource(source, {}, async () => {
        calls++;
        return {
          status: 302,
          headers: { location: 'https://127.0.0.1/private' },
          body: Buffer.alloc(0),
          url: source.url,
        };
      }),
    ).rejects.toThrow('SOURCE_SCOPE');
    expect(calls).toBe(1);
  });
  it('permits only the configured main document in browser mode', () => {
    expect(assertBrowserRequest(source.url, source, true, 'GET').href).toBe(source.url);
    expect(() => assertBrowserRequest(source.url, source, false, 'GET')).toThrow(
      'BROWSER_SUBRESOURCE_FORBIDDEN',
    );
    expect(() => assertBrowserRequest(source.url, source, true, 'POST')).toThrow(
      'BROWSER_SUBRESOURCE_FORBIDDEN',
    );
    expect(() => assertBrowserRequest('https://127.0.0.1/private', source, true, 'GET')).toThrow(
      'SOURCE_SCOPE',
    );
    expect(() =>
      assertBrowserRequest('https://tracker.example/collect', source, false, 'GET'),
    ).toThrow('BROWSER_SUBRESOURCE_FORBIDDEN');
  });
  it('bounds response bytes with or without content length', () => {
    expect(() => assertResponseLength(String(MAX_BYTES + 1), 0)).toThrow('SOURCE_TOO_LARGE');
    expect(() => assertResponseLength(undefined, MAX_BYTES + 1)).toThrow('SOURCE_TOO_LARGE');
    expect(() => assertResponseLength('invalid', 0)).toThrow();
    expect(() => assertResponseLength(String(MAX_BYTES), MAX_BYTES)).not.toThrow();
  });
  it('extracts actual main content and excludes executable/navigation markup', () => {
    const text = normalizeHtml(html, source.requiredPhrases);
    expect(text).toContain('Fictional source');
    expect(text).not.toContain('malicious');
    expect(text).not.toContain('Ignore navigation');
    expect(() => normalizeHtml(html.subarray(0, html.length - 7), source.requiredPhrases)).toThrow(
      'INCOMPLETE_HTML',
    );
    expect(() => normalizeHtml(html, ['Missing consequential passage'])).toThrow(
      'EXTRACTION_REQUIRED_PASSAGE_MISSING',
    );
    expect(() =>
      normalizeHtml(Buffer.from('<html><body>Only navigation</body></html>'), ['navigation']),
    ).toThrow('EXTRACTION_MAIN_MISSING');
  });
  it('rejects oversized normalized text rather than truncating evidence', () => {
    const big = Buffer.from('<html><main>' + 'fictional source '.repeat(8000) + '</main></html>');
    expect(() => normalizeHtml(big, source.requiredPhrases)).toThrow('EXTRACTION_TOO_LARGE');
  });
  it('deduplicates immutable evidence and verifies bytes before accepting 304', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swf-evidence-'));
    try {
      const response = {
        status: 200,
        headers: { etag: 'fixture-tag' },
        body: html,
        url: source.url,
      };
      const first = await retain(source, response, dir);
      const second = await retain(source, response, dir);
      expect(second.sourceVersionId).toBe(first.sourceVersionId);
      expect(await readFile(join(dir, `${first.snapshotSha256}.html`))).toEqual(html);
      const cached = await retain(
        source,
        { ...response, status: 304, body: Buffer.alloc(0) },
        dir,
        first,
      );
      expect(cached.snapshotSha256).toBe(first.snapshotSha256);
      await writeFile(join(dir, `${first.snapshotSha256}.html`), 'tampered');
      await expect(
        retain(source, { ...response, status: 304, body: Buffer.alloc(0) }, dir, first),
      ).rejects.toThrow('EVIDENCE_INTEGRITY');
      await immutableWrite(join(dir, 'immutable'), 'one');
      await expect(immutableWrite(join(dir, 'immutable'), 'two')).rejects.toThrow(
        'IMMUTABLE_ARTIFACT_CONFLICT',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('rejects unexpected 304 and unsupported content types', async () => {
    await expect(
      retain(
        source,
        { status: 304, headers: {}, body: Buffer.alloc(0), url: source.url },
        '/unused',
      ),
    ).rejects.toThrow('UNEXPECTED_NOT_MODIFIED');
    await expect(
      fetchSource(source, {}, async () => ({
        status: 200,
        headers: { 'content-type': 'application/pdf' },
        body: html,
        url: source.url,
      })),
    ).rejects.toThrow('UNSUPPORTED_CONTENT');
  });
});
