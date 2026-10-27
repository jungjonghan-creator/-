import { openDB, IDBPDatabase } from 'idb';
import type { Session } from '../game/session';
import { migrate, validateSession } from './validate';
import { verifyWallet, Wallet } from '../economy/wallet';

const DB_NAME = 'poker-arena';
const DB_VERSION = 1;
let dbp: Promise<IDBPDatabase> | null = null;

function getDb() {
  dbp ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    },
  });
  return dbp;
}

/** 테스트 전용: 캐시된 DB 연결을 버린다 */
export function resetDbForTests() { dbp = null; }

export async function saveSession(s: Session): Promise<void> {
  await (await getDb()).put('kv', JSON.parse(JSON.stringify(s)), 'session');
}
export type LoadResult = { status: 'none' } | { status: 'ok'; session: Session } | { status: 'corrupt'; errors: string[]; raw: unknown };

export async function loadSession(): Promise<LoadResult> {
  const raw = await (await getDb()).get('kv', 'session');
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
export async function clearSession() { await (await getDb()).delete('kv', 'session'); }
export async function saveKV(key: string, v: unknown) { await (await getDb()).put('kv', v, key); }
export async function loadKV<T>(key: string): Promise<T | undefined> { return (await getDb()).get('kv', key); }

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

// ───────── 원자적 저장 (세션 + 통장 + 기억을 한 트랜잭션으로) ─────────
export interface SaveParts { session?: Session | null; wallet?: Wallet; kv?: Record<string, unknown> }

/**
 * 세션과 통장은 항상 같은 트랜잭션으로 저장한다. 도중에 종료돼도 "통장만 차감되고 경기는 없는" 상태가 생기지 않는다.
 * session === null 이면 저장된 세션을 삭제한다.
 */
export async function saveAll(parts: SaveParts): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('kv', 'readwrite');
  const store = tx.objectStore('kv');
  if (parts.session === null) store.delete('session');
  else if (parts.session) store.put(JSON.parse(JSON.stringify(parts.session)), 'session');
  if (parts.wallet) store.put(JSON.parse(JSON.stringify(parts.wallet)), 'wallet');
  for (const [k, v] of Object.entries(parts.kv ?? {})) store.put(JSON.parse(JSON.stringify(v)), k);
  await tx.done;
}

export type WalletLoad = { status: 'none' } | { status: 'ok'; wallet: Wallet } | { status: 'corrupt'; errors: string[] };
export async function loadWallet(): Promise<WalletLoad> {
  const raw = await (await getDb()).get('kv', 'wallet');
  if (!raw) return { status: 'none' };
  const errs = verifyWallet(raw as Wallet);
  return errs.length ? { status: 'corrupt', errors: errs } : { status: 'ok', wallet: raw as Wallet };
}
