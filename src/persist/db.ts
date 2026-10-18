import { openDB, IDBPDatabase } from 'idb';
import type { Session } from '../game/session';
import { migrate, validateSession } from './validate';

const DB_NAME = 'poker-arena';
const DB_VERSION = 1;
let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  dbp ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    },
  });
  return dbp;
}

export async function saveSession(s: Session): Promise<void> {
  await (await db()).put('kv', JSON.parse(JSON.stringify(s)), 'session');
}
export type LoadResult = { status: 'none' } | { status: 'ok'; session: Session } | { status: 'corrupt'; errors: string[]; raw: unknown };

export async function loadSession(): Promise<LoadResult> {
  const raw = await (await db()).get('kv', 'session');
  if (!raw) return { status: 'none' };
  try {
    const m = migrate(raw);
    const v = validateSession(m);
    if (!v.ok) return { status: 'corrupt', errors: v.errors, raw };
    return { status: 'ok', session: m as Session };
  } catch (e) {
    return { status: 'corrupt', errors: [(e as Error).message], raw };
  }
}
export async function clearSession() { await (await db()).delete('kv', 'session'); }
export async function saveKV(key: string, v: unknown) { await (await db()).put('kv', v, key); }
export async function loadKV<T>(key: string): Promise<T | undefined> { return (await db()).get('kv', key); }

export function exportSession(s: Session): string {
  return JSON.stringify({ app: 'poker-arena', exportedAt: new Date().toISOString(), session: s }, null, 1);
}
/** 가져오기: 스키마/카드/칩/리플레이 검증 실패 시 거부 (조용한 복구 금지) */
export function importSession(text: string): { ok: true; session: Session } | { ok: false; errors: string[] } {
  try {
    const obj = JSON.parse(text);
    const m = migrate(obj.session);
    const v = validateSession(m);
    return v.ok ? { ok: true, session: m } : { ok: false, errors: v.errors };
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
}
