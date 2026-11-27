import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import fixture from './fixtures/fictional-flow.json';
import { digest, validateBundle, type FlowSummary } from '../packages/core';
import { handle, type Env } from '../workers/api';
let mf: Miniflare, db: D1Database, env: Env, f: FlowSummary, now: number;
const b = validateBundle(fixture);
const req = (
  path: string,
  body?: unknown,
  token?: string,
  key = 'retry-key-0001',
  method?: string,
) =>
  new Request(`https://example.test/api/v1/${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      origin: 'https://example.test',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'idempotency-key': key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const create = async () => {
  const r = await handle(req('sessions', { flowId: f.id, locale: 'en' }), env, now);
  expect(r.status).toBe(201);
  return r.json() as Promise<any>;
};
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: '2026-11-21',
      d1Databases: ['DB'],
    }),
  );
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  for (const sql of readFileSync('workers/api/migrations/0001_sessions.sql', 'utf8')
    .split(';')
    .filter((x) => x.trim()))
    await db.prepare(sql).run();
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db.prepare('DELETE FROM sessions').run();
  now = Date.now();
  f = {
    id: b.flowId,
    title: 'Fictional fixture',
    scope: b.scope,
    status: 'active',
    officialUrl: 'https://example.org',
    statusEpoch: 1,
    bundleHash: await digest(b),
    lastSuccessfulCheckAt: new Date(now).toISOString(),
  };
  env = {
    SESSIONS_DB: db,
    ENVIRONMENT: 'test',
    PUBLIC_ORIGIN: 'https://example.test',
    CONTENT: {
      async listFlows() {
        return [f];
      },
      async getFlow(id) {
        return id === f.id ? f : null;
      },
      async getBundle() {
        return b;
      },
      async getSources() {
        return b.sources;
      },
    },
  };
});
describe('public API against local workerd D1', () => {
  it('completes a flow, stores only a hashed capability, and returns no-store', async () => {
    const s = await create();
    expect((await db.prepare('SELECT token_hash FROM sessions').first<any>()).token_hash).not.toBe(
      s.token,
    );
    const r = await handle(
      req(
        `sessions/${s.sessionId}/answers`,
        { questionId: b.entryQuestionId, choiceId: 'yes', sequence: 0 },
        s.token,
      ),
      env,
      now,
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(((await r.json()) as any).step.type).toBe('outcome');
  });
  it('retries identically but rejects reuse for a different answer', async () => {
    const s = await create(),
      path = `sessions/${s.sessionId}/answers`,
      answer = { questionId: b.entryQuestionId, choiceId: 'no', sequence: 0 };
    const first = await handle(req(path, answer, s.token), env, now),
      second = await handle(req(path, answer, s.token), env, now);
    expect(await second.json()).toEqual(await first.json());
    expect(
      (await handle(req(path, { ...answer, choiceId: 'yes' }, s.token), env, now)).status,
    ).toBe(409);
  });
  it('serializes concurrent conflicting answers through D1 CAS', async () => {
    const s = await create();
    const rs = await Promise.all(
      ['yes', 'no'].map((choiceId, i) =>
        handle(
          req(
            `sessions/${s.sessionId}/answers`,
            { questionId: b.entryQuestionId, choiceId, sequence: 0 },
            s.token,
            `different-key-${i}`,
          ),
          env,
          now,
        ),
      ),
    );
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await db.prepare('SELECT sequence FROM sessions').first<any>()).sequence).toBe(1);
  });
  it('denies wrong capability and invalid choices', async () => {
    const s = await create(),
      answer = { questionId: b.entryQuestionId, choiceId: 'bad', sequence: 0 };
    expect(
      (await handle(req(`sessions/${s.sessionId}/answers`, answer, 'a'.repeat(64)), env, now))
        .status,
    ).toBe(401);
    expect(
      (await handle(req(`sessions/${s.sessionId}/answers`, answer, s.token), env, now)).status,
    ).toBe(400);
  });
  it('expires idle sessions; status requests do not refresh them', async () => {
    const s = await create();
    await handle(req(`flows/${f.id}`), env, now + 29 * 60000);
    expect(
      (
        await handle(
          req(
            `sessions/${s.sessionId}/answers`,
            { questionId: b.entryQuestionId, choiceId: 'yes', sequence: 0 },
            s.token,
          ),
          env,
          now + 30 * 60000,
        )
      ).status,
    ).toBe(410);
  });
  it('suspends stale sources and changed epochs', async () => {
    const s = await create();
    f.statusEpoch++;
    expect(
      (
        await handle(
          req(
            `sessions/${s.sessionId}/answers`,
            { questionId: b.entryQuestionId, choiceId: 'yes', sequence: 0 },
            s.token,
          ),
          env,
          now,
        )
      ).status,
    ).toBe(409);
    f.lastSuccessfulCheckAt = new Date(now - 72 * 3600000).toISOString();
    expect((await handle(req('sessions', { flowId: f.id, locale: 'en' }), env, now)).status).toBe(
      423,
    );
  });
  it('deletes capabilities idempotently including expired sessions', async () => {
    const s = await create();
    for (let i = 0; i < 2; i++)
      expect(
        (
          await handle(
            req(`sessions/${s.sessionId}`, undefined, s.token, undefined, 'DELETE'),
            env,
            now + 3 * 3600000,
          )
        ).status,
      ).toBe(200);
    expect(await db.prepare('SELECT * FROM sessions').first()).toBeNull();
  });
  it('rejects production fixtures and fails closed if authority fails', async () => {
    env.ENVIRONMENT = 'production';
    env.GUIDANCE_LIMITER = {
      async limit() {
        return { success: true };
      },
    };
    expect((await handle(req('sessions', { flowId: f.id, locale: 'en' }), env, now)).status).toBe(
      503,
    );
    env.CONTENT.getFlow = async () => {
      throw Error('D1 unavailable');
    };
    expect((await handle(req(`flows/${f.id}`), env, now)).status).toBe(503);
  });
  it('rejects duplicate JSON keys and cross-site submissions', async () => {
    const r = new Request('https://example.test/api/v1/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"flowId":"a","flowId":"b","locale":"en"}',
    });
    expect((await handle(r, env, now)).status).toBe(400);
    const evil = req('sessions', { flowId: f.id, locale: 'en' });
    evil.headers.set('origin', 'https://evil.test');
    expect((await handle(evil, env, now)).status).toBe(403);
  });
});
