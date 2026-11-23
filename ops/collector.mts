import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';

export const MAX_BYTES = 1024 * 1024,
  MAX_TEXT_BYTES = 100 * 1024,
  EXTRACTOR_VERSION = 'parse5-content-v4';
export type SourceConfig = {
  id: string;
  flowId: string;
  url: string;
  title: string;
  approvedOrigin: string;
  approvedPath: string;
  requiredPhrases: string[];
  contentId?: string;
  acquisition?: 'https' | 'browser';
};
type RawResponse = { status: number; headers: Record<string, string>; body: Buffer; url: string };
type Snapshot = {
  sourceId: string;
  sourceVersionId: string;
  evidenceId: string;
  snapshotSha256: string;
  normalizedSha256: string;
  normalizedText: string;
  extractorVersion: string;
  bytes: number;
  url: string;
  checkedAt: string;
  etag?: string;
  lastModified?: string;
  canonicalSource?: {
    sourceVersionId: string;
    snapshotSha256: string;
    normalizedSha256: string;
    evidenceId: string;
  };
};
type State = {
  sources: Record<
    string,
    { snapshot?: Snapshot; nextCheckAt: number; lastAttemptAt: string; error?: string }
  >;
};
export const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const idPattern = /^[a-z][a-z0-9_-]{0,63}$/;
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const p = address.split('.').map(Number),
      n = (((p[0]! << 24) >>> 0) + (p[1]! << 16) + (p[2]! << 8) + p[3]!) >>> 0;
    return ![
      [0, 8],
      [0x0a000000, 8],
      [0x64400000, 10],
      [0x7f000000, 8],
      [0xa9fe0000, 16],
      [0xac100000, 12],
      [0xc0000000, 24],
      [0xc0000200, 24],
      [0xc0586300, 24],
      [0xc0a80000, 16],
      [0xc6120000, 15],
      [0xc6336400, 24],
      [0xcb007100, 24],
      [0xe0000000, 4],
      [0xf0000000, 4],
    ].some(([base, bits]) => n >>> (32 - bits!) === base! >>> (32 - bits!));
  }
  if (isIP(address) !== 6 || address.includes('.') || address.includes('%')) return false;
  const halves = address.toLowerCase().split('::'),
    left = halves[0]!.split(':').filter(Boolean),
    right = (halves[1] ?? '').split(':').filter(Boolean);
  const groups =
    halves.length === 2
      ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
      : left;
  const n = groups.reduce((n, x) => (n << 16n) + BigInt(parseInt(x, 16)), 0n);
  const prefix = (value: bigint, bits: number) => n >> BigInt(128 - bits) === value;
  return (
    prefix(1n, 3) &&
    !prefix(0x100080n, 23) &&
    !prefix(0x20010db8n, 32) &&
    !prefix(0x2002n, 16) &&
    !prefix(0x3fffn, 16)
  );
}
export function assertSourceUrl(raw: string, source: SourceConfig): URL {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.origin !== source.approvedOrigin ||
    url.pathname !== source.approvedPath
  )
    throw Error('SOURCE_SCOPE');
  return url;
}
export async function resolvePublic(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  if (isIP(hostname)) throw Error('IP_LITERAL_FORBIDDEN');
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      deadline = setTimeout(() => reject(Error('DNS_TIMEOUT')), 10000);
    }),
  ]).finally(() => clearTimeout(deadline));
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw Error('NON_PUBLIC_DESTINATION');
  const selected = addresses.find((a) => a.family === 4) ?? addresses[0]!;
  return { address: selected.address, family: selected.family as 4 | 6 };
}
export function assertResponseLength(contentLength: string | undefined, total: number) {
  if (
    total > MAX_BYTES ||
    (contentLength !== undefined &&
      (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BYTES))
  )
    throw Error('SOURCE_TOO_LARGE');
}
async function requestPinned(url: URL, headers: Record<string, string>): Promise<RawResponse> {
  const address = await resolvePublic(url.hostname);
  return new Promise((accept, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        agent: false,
        servername: url.hostname,
        headers: {
          'User-Agent': 'SourceWayfinderSourceCollector/1.0 (+https://sourcewayfinder.org)',
          Accept: 'text/html',
          'Accept-Encoding': 'identity',
          ...headers,
        },
        lookup: (_host, options, callback) => {
          if ((options as { all?: boolean }).all)
            (
              callback as unknown as (
                error: null,
                addresses: { address: string; family: number }[],
              ) => void
            )(null, [address]);
          else callback(null, address.address, address.family);
        },
      },
      (res) => {
        const out: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (typeof value === 'string') out[key] = value;
        }
        try {
          assertResponseLength(out['content-length'], 0);
        } catch (e) {
          res.destroy();
          reject(e);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          try {
            assertResponseLength(undefined, size);
            chunks.push(chunk);
          } catch (e) {
            res.destroy();
            reject(e);
          }
        });
        res.on('end', () => {
          if (!res.complete) {
            reject(Error('INCOMPLETE_RESPONSE'));
            return;
          }
          accept({
            status: res.statusCode ?? 0,
            headers: out,
            body: Buffer.concat(chunks),
            url: url.href,
          });
        });
        res.on('error', reject);
        res.on('aborted', () => reject(Error('INCOMPLETE_RESPONSE')));
      },
    );
    const deadline = setTimeout(() => req.destroy(Error('SOURCE_TIMEOUT')), 30000);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', reject);
    req.end();
  });
}
export async function fetchSource(
  source: SourceConfig,
  conditional: Record<string, string> = {},
  transport = requestPinned,
): Promise<RawResponse> {
  let url = assertSourceUrl(source.url, source);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await transport(url, conditional);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.headers.location) throw Error('REDIRECT_WITHOUT_LOCATION');
      url = assertSourceUrl(new URL(response.headers.location, url).href, source);
      continue;
    }
    if (response.status !== 200 && response.status !== 304)
      throw Error(`SOURCE_HTTP_${response.status}`);
    if (
      response.status === 200 &&
      (!/^text\/html(?:;|$)/i.test(response.headers['content-type'] ?? '') ||
        (response.headers['content-encoding'] &&
          response.headers['content-encoding'] !== 'identity'))
    )
      throw Error('UNSUPPORTED_CONTENT');
    assertResponseLength(response.headers['content-length'], response.body.length);
    return response;
  }
  throw Error('TOO_MANY_REDIRECTS');
}
export function assertBrowserRequest(
  url: string,
  source: SourceConfig,
  isMainDocument: boolean,
  method: string,
) {
  if (!isMainDocument || method !== 'GET') throw Error('BROWSER_SUBRESOURCE_FORBIDDEN');
  return assertSourceUrl(url, source);
}
export async function fetchSourceBrowser(source: SourceConfig): Promise<RawResponse> {
  // Explicitly configured acquisition only; never a challenge-solving or authenticated browser.
  if (source.acquisition !== 'browser') throw Error('BROWSER_SOURCE_NOT_CONFIGURED');
  const url = assertSourceUrl(source.url, source),
    address = await resolvePublic(url.hostname);
  const { chromium } = await import('@playwright/test');
  const pinned = address.family === 6 ? `[${address.address}]` : address.address;
  const browser = await chromium.launch({
    args: [
      `--host-resolver-rules=MAP ${url.hostname} ${pinned}`,
      '--no-proxy-server',
      '--disable-background-networking',
    ],
  });
  const context = await browser.newContext({
    javaScriptEnabled: false,
    serviceWorkers: 'block',
    acceptDownloads: false,
  });
  const page = await context.newPage();
  let failure: Error | undefined,
    totalBytes = 0;
  const fail = (error: Error) => {
    failure ??= error;
    void page.close().catch(() => undefined);
  };
  const deadline = setTimeout(() => fail(Error('SOURCE_TIMEOUT')), 30000);
  try {
    await context.route('**/*', async (route) => {
      try {
        const req = route.request();
        assertBrowserRequest(
          req.url(),
          source,
          req.isNavigationRequest() && req.frame() === page.mainFrame(),
          req.method(),
        );
        await resolvePublic(new URL(req.url()).hostname);
        await route.continue();
      } catch (e) {
        await route.abort('blockedbyclient').catch(() => undefined);
        if (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame())
          fail(e instanceof Error ? e : Error('BROWSER_REQUEST_REJECTED'));
      }
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable', {
      maxTotalBufferSize: MAX_BYTES,
      maxResourceBufferSize: MAX_BYTES,
    });
    cdp.on('Network.dataReceived', (event) => {
      totalBytes += Math.max(event.dataLength, event.encodedDataLength);
      if (totalBytes > MAX_BYTES) fail(Error('SOURCE_TOO_LARGE'));
    });
    cdp.on('Network.responseReceived', (event) => {
      if (event.type !== 'Document') return;
      try {
        assertSourceUrl(event.response.url, source);
        const headers = Object.fromEntries(
          Object.entries(event.response.headers).map(([k, v]) => [k.toLowerCase(), String(v)]),
        );
        assertResponseLength(headers['content-length'], 0);
        if (!/^text\/html(?:;|$)/i.test(headers['content-type'] ?? ''))
          throw Error('UNSUPPORTED_CONTENT');
      } catch (e) {
        fail(e instanceof Error ? e : Error('BROWSER_RESPONSE_REJECTED'));
      }
    });
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (failure) throw failure;
    if (!response || response.status() !== 200)
      throw Error(`SOURCE_HTTP_${response?.status() ?? 0}`);
    const body = await response.body();
    if (failure) throw failure;
    assertResponseLength(undefined, body.length);
    const headers = await response.allHeaders();
    // Playwright returns decoded document bytes, as retained in the acquisition provenance.
    delete headers['content-encoding'];
    delete headers['content-length'];
    return { status: 200, headers, body, url: response.url() };
  } catch (e) {
    throw failure ?? e;
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}

type HtmlNode = {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: HtmlNode[];
};
export function normalizeHtml(raw: Buffer, requiredPhrases: string[], contentId?: string): string {
  const html = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  if (!/<\/html\s*>/i.test(html)) throw Error('INCOMPLETE_HTML');
  const doc = parse(html) as unknown as HtmlNode;
  const candidates: HtmlNode[] = [];
  let baseHref: string | undefined;
  const discover = (n: HtmlNode) => {
    if (n.tagName === 'base' && baseHref === undefined)
      baseHref = n.attrs?.find((a) => a.name === 'href')?.value;
    if (
      contentId
        ? n.attrs?.some((a) => a.name === 'id' && a.value === contentId)
        : n.tagName === 'main' ||
          n.tagName === 'article' ||
          n.attrs?.some((a) => a.name === 'role' && a.value === 'main')
    )
      candidates.push(n);
    for (const child of n.childNodes ?? []) discover(child);
  };
  discover(doc);
  if (!candidates.length || (contentId && candidates.length !== 1))
    throw Error('EXTRACTION_MAIN_MISSING');
  const ignored = new Set([
    'script',
    'style',
    'noscript',
    'nav',
    'header',
    'footer',
    'iframe',
    'svg',
    'template',
  ]);
  type Navigation = { tag: string; attributes: Record<string, string>; label: string };
  const extract = (n: HtmlNode, navigation: Navigation[]): string => {
    // Some publishers embed standalone server-render timestamps in hidden spans.
    // Exclude only that metadata shape, never hidden accordion instructions or dates
    // in visible prose. Raw HTML remains retained in immutable evidence.
    const hiddenTimestamp =
      n.tagName === 'span' &&
      n.attrs?.some(
        (a) =>
          a.name === 'style' && /^\s*display\s*:\s*none\s*(?:!important\s*)?;?\s*$/i.test(a.value),
      ) &&
      n.childNodes?.every((child) => child.nodeName === '#text') &&
      /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?$/.test(
        (n.childNodes ?? [])
          .map((child) => child.value ?? '')
          .join('')
          .trim(),
      );
    if (hiddenTimestamp) return '';

    if (
      ignored.has(n.tagName ?? '') ||
      n.attrs?.some((a) => a.name === 'aria-hidden' && a.value === 'true')
    )
      return '';
    if (n.nodeName === '#text') return n.value ?? '';
    const prose = (n.childNodes ?? []).map((child) => extract(child, navigation)).join(' ');
    // Keep prose contiguous for passage review. Retain destinations separately as inert
    // evidence: changing where a link/form leads must invalidate the semantic hash.
    const keys =
      n.tagName === 'a' || n.tagName === 'area'
        ? ['href']
        : n.tagName === 'form'
          ? ['action', 'method']
          : n.tagName === 'button' || n.tagName === 'input'
            ? ['formaction', 'formmethod']
            : [];
    const attributes = Object.fromEntries(
      keys.flatMap((key) => {
        const attr = n.attrs?.find((a) => a.name === key);
        return attr ? [[key, attr.value.trim()]] : [];
      }),
    );
    if (Object.keys(attributes).length)
      navigation.push({
        tag: n.tagName!,
        attributes,
        label: prose.normalize('NFC').replace(/\s+/g, ' ').trim(),
      });
    return prose;
  };
  const selected = candidates
    .map((node) => {
      const navigation: Navigation[] = [];
      const text = extract(node, navigation).normalize('NFC').replace(/\s+/g, ' ').trim();
      return { text, navigation };
    })
    .sort((a, b) => b.text.length - a.text.length)[0]!;
  const text = selected.text;
  if (
    text.length < 100 ||
    !requiredPhrases.length ||
    requiredPhrases.some((p) => !text.toLowerCase().includes(p.toLowerCase()))
  )
    throw Error('EXTRACTION_REQUIRED_PASSAGE_MISSING');
  const normalized =
    selected.navigation.length || baseHref !== undefined
      ? `${text}\n[Navigation evidence]\n${JSON.stringify({ baseHref, navigation: selected.navigation })}`
      : text;
  if (Buffer.byteLength(normalized) > MAX_TEXT_BYTES) throw Error('EXTRACTION_TOO_LARGE');
  return normalized;
}
export async function immutableWrite(path: string, body: Buffer | string) {
  try {
    await writeFile(path, body, { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    const existing = await readFile(path);
    if (digest(existing) !== digest(body)) throw Error('IMMUTABLE_ARTIFACT_CONFLICT');
  }
}
export async function retain(
  source: SourceConfig,
  response: RawResponse,
  directory: string,
  previous?: Snapshot,
): Promise<Snapshot> {
  const extractorVersion = `${EXTRACTOR_VERSION}:${source.contentId ?? 'main'}:${source.acquisition ?? 'https'}`;
  if (response.status === 304) {
    if (!previous) throw Error('UNEXPECTED_NOT_MODIFIED');
    const raw = await readFile(join(directory, `${previous.snapshotSha256}.html`));
    if (digest(raw) !== previous.snapshotSha256) throw Error('EVIDENCE_INTEGRITY');
    const text = await readFile(join(directory, `${previous.normalizedSha256}.txt`), 'utf8');
    if (digest(text) !== previous.normalizedSha256 || text !== previous.normalizedText)
      throw Error('EVIDENCE_INTEGRITY');
    if (previous.extractorVersion !== extractorVersion)
      return retain(
        source,
        {
          status: 200,
          body: raw,
          url: previous.url,
          headers: {
            ...(previous.etag ? { etag: previous.etag } : {}),
            ...(previous.lastModified ? { 'last-modified': previous.lastModified } : {}),
          },
        },
        directory,
      );
    return { ...previous, checkedAt: new Date().toISOString() };
  }
  const normalizedText = normalizeHtml(response.body, source.requiredPhrases, source.contentId),
    snapshotSha256 = digest(response.body),
    normalizedSha256 = digest(normalizedText);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await immutableWrite(join(directory, `${snapshotSha256}.html`), response.body);
  await immutableWrite(join(directory, `${normalizedSha256}.txt`), normalizedText);
  const versionKey = digest(
    `${source.id}:${snapshotSha256}:${normalizedSha256}:${extractorVersion}`,
  );
  const snapshot: Snapshot = {
    sourceId: source.id,
    sourceVersionId: `v_${versionKey.slice(0, 60)}`,
    evidenceId: `e_${snapshotSha256.slice(0, 60)}`,
    snapshotSha256,
    normalizedSha256,
    normalizedText,
    extractorVersion,
    bytes: response.body.length,
    url: response.url,
    checkedAt: new Date().toISOString(),
    ...(response.headers.etag ? { etag: response.headers.etag } : {}),
    ...(response.headers['last-modified']
      ? { lastModified: response.headers['last-modified'] }
      : {}),
  };
  await immutableWrite(
    join(directory, `${versionKey}.metadata.json`),
    JSON.stringify({ ...snapshot, normalizedText: undefined, checkedAt: undefined }, null, 2),
  );
  return snapshot;
}
async function policyClient() {
  let config: Record<string, string> = {};
  const configPath = process.env.SWF_COLLECTOR_CONFIG;
  if (configPath) {
    const info = await lstat(configPath);
    if (
      !info.isFile() ||
      (info.mode & 0o777) !== 0o600 ||
      (process.getuid && info.uid !== process.getuid())
    )
      throw Error('COLLECTOR_CONFIG_REQUIRES_OWNER_MODE_600');
    try {
      config = JSON.parse(await readFile(configPath, 'utf8'));
    } catch {
      throw Error('COLLECTOR_CONFIG_INVALID_JSON');
    }
  }
  const origin = config.policyOrigin ?? process.env.SWF_POLICY_ORIGIN,
    token = config.collectorToken ?? process.env.SWF_COLLECTOR_TOKEN;
  if (!origin && !token) return null;
  if (!origin || !token) throw Error('POLICY_CONFIG_INCOMPLETE');
  const accessClientId = config.accessClientId,
    accessClientSecret = config.accessClientSecret;
  if (!!accessClientId !== !!accessClientSecret) throw Error('ACCESS_CREDENTIALS_INCOMPLETE');
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw Error('POLICY_ORIGIN_INVALID');
  return async (path: string, method = 'GET', body?: unknown) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (accessClientId && accessClientSecret) {
      headers['CF-Access-Client-Id'] = accessClientId;
      headers['CF-Access-Client-Secret'] = accessClientSecret;
    }
    const res = await fetch(new URL(path, url), {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw Error(`POLICY_HTTP_${res.status}`);
    return (await res.json()) as Record<string, any>;
  };
}
export async function upload(
  snapshot: Snapshot,
  directory: string,
  api: NonNullable<Awaited<ReturnType<typeof policyClient>>>,
) {
  const body = await readFile(join(directory, `${snapshot.snapshotSha256}.html`));
  if (digest(body) !== snapshot.snapshotSha256) throw Error('EVIDENCE_INTEGRITY');
  const chunks = Math.ceil(body.length / 131072);
  const reservation = await api('/internal/v1/evidence', 'POST', {
    id: snapshot.evidenceId,
    rawSha256: snapshot.snapshotSha256,
    bytes: body.length,
    chunks,
  });
  if (!reservation.complete) {
    for (let i = 0; i < chunks; i++)
      await api(`/internal/v1/evidence/${snapshot.evidenceId}/chunks/${i}`, 'PUT', {
        base64: body.subarray(i * 131072, (i + 1) * 131072).toString('base64'),
      });
    await api(`/internal/v1/evidence/${snapshot.evidenceId}/complete`, 'POST');
  }
  return api('/internal/v1/source-checks', 'POST', {
    sourceId: snapshot.sourceId,
    sourceVersionId: snapshot.sourceVersionId,
    snapshotSha256: snapshot.snapshotSha256,
    normalizedSha256: snapshot.normalizedSha256,
    normalizedText: snapshot.normalizedText,
    extractorVersion: snapshot.extractorVersion,
    evidenceId: snapshot.evidenceId,
  });
}
export async function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url))),
    directory = join(root, 'private/evidence'),
    statePath = join(directory, 'collector-state.json');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, 'collector.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  } catch {
    throw Error('COLLECTOR_ALREADY_RUNNING_OR_STALE_LOCK');
  }
  const runId = randomUUID();
  try {
    const configured = JSON.parse(
      await readFile(join(root, 'domains/sources.json'), 'utf8'),
    ) as SourceConfig[];
    let sources = configured;
    const selectedIndex = process.argv.indexOf('--source');
    if (selectedIndex >= 0) {
      const selected = process.argv[selectedIndex + 1];
      sources = configured.filter((s) => s.id === selected);
      if (!sources.length) throw Error('UNKNOWN_SOURCE');
    }
    const api = await policyClient();
    if (api) {
      const registered = await api('/internal/v1/sources');
      sources = sources.filter((s) =>
        registered.sources?.some(
          (r: any) =>
            r.id === s.id &&
            r.url === s.url &&
            r.approved_origin === s.approvedOrigin &&
            r.approved_path === s.approvedPath,
        ),
      );
      if (!sources.length) throw Error('NO_HUMAN_REGISTERED_SOURCES');
    }
    let state: State = { sources: {} };
    try {
      state = JSON.parse(await readFile(statePath, 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    for (const source of sources) {
      if (!idPattern.test(source.id)) throw Error('INVALID_SOURCE_ID');
      assertSourceUrl(source.url, source);
      const previous = state.sources[source.id];
      if (!process.argv.includes('--force') && previous && previous.nextCheckAt > Date.now())
        continue;
      const started = Date.now();
      let response: RawResponse | undefined;
      try {
        const headers: Record<string, string> = {};
        if (
          previous?.snapshot?.extractorVersion ===
          `${EXTRACTOR_VERSION}:${source.contentId ?? 'main'}:${source.acquisition ?? 'https'}`
        ) {
          if (previous.snapshot.etag) headers['If-None-Match'] = previous.snapshot.etag;
          if (previous.snapshot.lastModified)
            headers['If-Modified-Since'] = previous.snapshot.lastModified;
        }
        if (source.acquisition === 'browser' && !process.argv.includes('--browser'))
          throw Error('BROWSER_ACQUISITION_REQUIRES_EXPLICIT_FLAG');
        response =
          source.acquisition === 'browser'
            ? await fetchSourceBrowser(source)
            : await fetchSource(source, headers);
        const snapshot = await retain(source, response, directory, previous?.snapshot);
        const remote = api ? await upload(snapshot, directory, api) : null;
        if (remote) {
          snapshot.canonicalSource = {
            sourceVersionId: remote.sourceVersionId,
            snapshotSha256: remote.snapshotSha256,
            normalizedSha256: remote.normalizedSha256,
            evidenceId: remote.evidenceId,
          };
        }
        state.sources[source.id] = {
          snapshot,
          nextCheckAt: Date.now() + 24 * 60 * 60 * 1000 + randomInt(-1800000, 1800001),
          lastAttemptAt: new Date().toISOString(),
        };
        console.log(
          JSON.stringify({
            service: 'collector',
            runId,
            sourceId: source.id,
            artifactHash: snapshot.snapshotSha256,
            changed:
              previous?.snapshot?.normalizedSha256 !== snapshot.normalizedSha256 ||
              previous?.snapshot?.extractorVersion !== snapshot.extractorVersion,
            remote: !!remote,
            duration: Date.now() - started,
          }),
        );
      } catch (e) {
        const error = e instanceof Error ? e.message : 'COLLECTION_FAILED';
        if (response?.status === 200 && response.body.length <= MAX_BYTES)
          await immutableWrite(
            join(directory, `quarantine-${digest(response.body)}.html`),
            response.body,
          );
        state.sources[source.id] = {
          ...previous,
          nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
          lastAttemptAt: new Date().toISOString(),
          error,
        };
        if (api)
          await api('/internal/v1/source-checks', 'POST', { sourceId: source.id, error }).catch(
            () => undefined,
          );
        console.error(
          JSON.stringify({
            service: 'collector',
            runId,
            sourceId: source.id,
            error,
            ...(response ? { artifactHash: digest(response.body) } : {}),
            duration: Date.now() - started,
          }),
        );
        process.exitCode = 1;
      }
      await writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
      await rename(`${statePath}.tmp`, statePath);
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(
      JSON.stringify({
        service: 'collector',
        error: e instanceof Error ? e.message : 'COLLECTOR_FAILED',
      }),
    );
    process.exitCode = 1;
  });
