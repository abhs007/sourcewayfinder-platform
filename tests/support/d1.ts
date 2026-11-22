import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function createDB(paths: string[] = []) {
  const raw = new DatabaseSync(':memory:');
  for (const path of paths) raw.exec(readFileSync(path, 'utf8'));
  const result = (results: unknown[] = [], changes = 0) => ({
    success: true,
    results,
    meta: {
      changes,
      duration: 0,
      last_row_id: 0,
      changed_db: changes > 0,
      size_after: 0,
      rows_read: results.length,
      rows_written: changes,
    },
  });
  const prepare = (sql: string) => {
    let args: any[] = [];
    const s = {
      bind(...values: any[]) {
        args = values;
        return s;
      },
      async first(column?: string) {
        const row = raw.prepare(sql).get(...args) as any;
        return row ? (column ? row[column] : row) : null;
      },
      async all() {
        return result(raw.prepare(sql).all(...args));
      },
      async run() {
        const r = raw.prepare(sql).run(...args);
        return result([], Number(r.changes));
      },
      async raw() {
        return raw
          .prepare(sql)
          .all(...args)
          .map(Object.values);
      },
    };
    return s;
  };
  const db = {
    prepare,
    async batch(statements: any[]) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        raw.exec('COMMIT');
        return results;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql: string) {
      raw.exec(sql);
      return { count: 1, duration: 0 };
    },
    withSession() {
      return db;
    },
    raw,
    close() {
      raw.close();
    },
  };
  return db as unknown as D1Database & { raw: DatabaseSync; close(): void };
}
