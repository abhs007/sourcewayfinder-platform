import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import survey from '../workers/survey/index.js';
import schema from '../workers/survey/schema.json';
let mf: Miniflare, db: D1Database;
const base = 'https://sourcewayfinder.org';
const payload = (id = crypto.randomUUID()) => ({
  id,
  version: schema.version,
  consent: true,
  answers: { experience: 'Yes' },
});
const submit = (value: unknown, extra: HeadersInit = {}) =>
  new Request(`${base}/api/survey`, {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(value),
  });
const env = (success = true) => ({ DB: db, SURVEY_LIMITER: { limit: async () => ({ success }) } });
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'survey-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-11-01',
      d1Databases: { DB: 'survey' },
    }),
  );
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  const sql = await readFile('workers/survey/migrations/0001_responses.sql', 'utf8').catch(
    async () => {
      const { readdir } = await import('node:fs/promises');
      const [file] = await readdir('workers/survey/migrations');
      return readFile(`workers/survey/migrations/${file}`, 'utf8');
    },
  );
  for (const statement of sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(statement).run();
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db.prepare('DELETE FROM responses').run();
});
afterEach(() => vi.restoreAllMocks());
describe('preserved survey consent and retention against local D1', () => {
  it('stores explicit consent and original notice version without requiring optional answers', async () => {
    const p = payload(),
      res = await survey.fetch(submit(p), env());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: true, id: p.id });
    const row = await db.prepare('SELECT * FROM responses WHERE id=?').bind(p.id).first<any>();
    expect(row.notice_version).toBe('2026-11-21-public');
    expect(JSON.parse(row.payload)).toEqual({ ...p, answers: { experience: 'Yes', comment: '' } });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
  it('rejects absent or false consent, wrong versions, extra fields, and invalid choices', async () => {
    const p = payload();
    for (const invalid of [
      { ...p, consent: false },
      { ...p, consent: undefined },
      { ...p, version: 'unreviewed' },
      { ...p, email: 'not-collected@example.test' },
      { ...p, answers: {} },
      { ...p, answers: { experience: 'Invented choice' } },
    ])
      expect((await survey.fetch(submit(invalid), env())).status).toBe(400);
    expect((await db.prepare('SELECT COUNT(*) AS count FROM responses').first<any>()).count).toBe(
      0,
    );
  });
  it('preserves idempotency including normalized checkbox order, rejecting changed content', async () => {
    const p = {
      ...payload(),
      answers: {
        experience: 'Yes',
        obstacles: ['Finding the right form or contact', 'Understanding the wording'],
      },
    };
    const first = await survey.fetch(submit(p), env());
    expect(first.status).toBe(200);
    expect(
      (
        await survey.fetch(
          submit({
            ...p,
            answers: { ...p.answers, obstacles: [...p.answers.obstacles].reverse() },
          }),
          env(),
        )
      ).status,
    ).toBe(200);
    expect(
      (await survey.fetch(submit({ ...p, answers: { experience: 'No' } }), env())).status,
    ).toBe(409);
    expect((await db.prepare('SELECT COUNT(*) AS count FROM responses').first<any>()).count).toBe(
      1,
    );
  });
  it('handles concurrent same-ID submissions without overwriting the accepted answer', async () => {
    const p = payload(),
      results = await Promise.all([
        survey.fetch(submit(p), env()),
        survey.fetch(submit({ ...p, answers: { experience: 'No' } }), env()),
      ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await db.prepare('SELECT COUNT(*) AS count FROM responses').first<any>()).count).toBe(
      1,
    );
  });
  it('retains the existing exclusive-choice and comment limits', async () => {
    for (const answers of [
      { experience: 'Yes', obstacles: ['Nothing made it difficult', 'Understanding the wording'] },
      { experience: 'Yes', obstacles: ['Understanding the wording', 'Understanding the wording'] },
      { experience: 'Yes', comment: 'x'.repeat(1001) },
    ])
      expect((await survey.fetch(submit({ ...payload(), answers }), env())).status).toBe(400);
  });
  it('rejects cross-origin, oversized and rate-limited requests without writing', async () => {
    expect(
      (await survey.fetch(submit(payload(), { Origin: 'https://attacker.example.test' }), env()))
        .status,
    ).toBe(403);
    expect(
      (
        await survey.fetch(
          submit({ ...payload(), answers: { experience: 'Yes', comment: 'x'.repeat(13000) } }),
          env(),
        )
      ).status,
    ).toBe(400);
    const limited = await survey.fetch(submit(payload()), env(false));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect((await db.prepare('SELECT COUNT(*) AS count FROM responses').first<any>()).count).toBe(
      0,
    );
  });
  it('keeps status public but never exposes saved responses', async () => {
    await survey.fetch(submit(payload()), env());
    const res = await survey.fetch(new Request(`${base}/api/survey/status`), env());
    expect(await res.json()).toEqual({
      version: 'needs-v1',
      storage: 'cloudflare',
      noticeVersion: '2026-11-21-public',
    });
    expect((await survey.fetch(new Request(`${base}/api/survey`), env())).status).toBe(405);
    expect((await survey.fetch(new Request(`${base}/responses`), env())).status).toBe(404);
  });
  it('removes only responses older than the existing 180-day retention boundary', async () => {
    const now = Date.parse('2026-11-22T12:00:00Z'),
      cutoff = now - 180 * 86400000;
    for (const [name, at] of [
      ['old', cutoff - 1],
      ['boundary', cutoff],
      ['recent', now],
    ] as const)
      await db
        .prepare(
          'INSERT INTO responses(id,received_at,version,notice_version,payload) VALUES(?,?,?,?,?)',
        )
        .bind(name, new Date(at).toISOString(), 'needs-v1', '2026-11-21-public', '{}')
        .run();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await survey.scheduled({}, env());
    expect(
      (await db.prepare('SELECT id FROM responses ORDER BY id').all<{ id: string }>()).results.map(
        (r) => r.id,
      ),
    ).toEqual(['boundary', 'recent']);
  });
  it('fails closed when persistence is unavailable', async () => {
    const broken = {
      ...env(),
      DB: {
        prepare() {
          throw Error('unavailable');
        },
      },
    };
    expect((await survey.fetch(submit(payload()), broken)).status).toBe(503);
    expect((await survey.fetch(new Request(`${base}/api/survey/status`), broken)).status).toBe(503);
  });
});
