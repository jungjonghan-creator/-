/** node:sqlite → D1 형태 어댑터 (로컬 서버·테스트 전용; Worker 번들에는 포함되지 않는다) */
import { DatabaseSync } from 'node:sqlite';
import type { Db, Stmt } from './db';

export function openNodeDb(path = ':memory:'): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const mk = (sql: string, binds: unknown[] = []): Stmt & { _sql: string; _binds: unknown[] } => ({
    _sql: sql, _binds: binds,
    bind: (...v: unknown[]) => mk(sql, v),
    first: async <T>() => (raw.prepare(sql).get(...(binds as never[])) as T | undefined) ?? null,
    all: async <T>() => ({ results: raw.prepare(sql).all(...(binds as never[])) as T[] }),
    run: async () => { const r = raw.prepare(sql).run(...(binds as never[])); return { meta: { changes: Number(r.changes) } }; },
  });
  return {
    raw,
    prepare: (sql: string) => mk(sql),
    batch: async (stmts: Stmt[]) => {
      raw.exec('BEGIN');
      try {
        const out: unknown[] = [];
        for (const s of stmts as unknown as { _sql: string; _binds: unknown[] }[]) {
          const r = raw.prepare(s._sql).run(...(s._binds as never[]));
          out.push({ meta: { changes: Number(r.changes) } });
        }
        raw.exec('COMMIT');
        return out;
      } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}
