import { openDB, IDBPDatabase } from 'idb';
import type { Session } from '../game/session';
import { migrate, validateSession } from './validate';
import { verifyWallet, Wallet } from '../economy/wallet';

export const LEGACY_DB_NAME = 'poker-arena';
let DB_NAME = LEGACY_DB_NAME;
const DB_VERSION = 1;
let dbp: Promise<IDBPDatabase> | null = null;

/** 계정별 로컬 저장소 분리: 서버 계정으로 로그인하면 `poker-arena-<accountId>`, 로컬 모드는 기존 `poker-arena` (기존 TETO 데이터가 그대로 유지된다) */
export function useDbFor(accountId: string | null) { const n = accountId ? `${LEGACY_DB_NAME}-${accountId}` : LEGACY_DB_NAME; if (n !== DB_NAME) { DB_NAME = n; dbp = null; } }
export const currentDbName = () => DB_NAME;

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

// ───────── 기존(레거시) 기록 이관 ─────────
export interface LegacyReport { found: boolean; copied: Record<string, number>; at: number; legacyWalletBalance?: number; note: string }
const LEGACY_KEYS = ['archive', 'memory', 'tourneys', 'settings'];

/**
 * 기존 기기 DB(`poker-arena`) 의 플레이 기록(핸드 아카이브·상대 관찰 기억·대회 전적·설정)을 새 계정 DB 로 "복사"한다.
 * 원본은 삭제하지 않는다(백업). 통장/진행 중 세션은 가져오지 않는다 — 돈은 서버 원장이 진실이고 옛 잔액은 검증되지 않은 값(legacy/unverified)이기 때문.
 */
export async function importLegacyInto(accountId: string): Promise<LegacyReport> {
  const target = `${LEGACY_DB_NAME}-${accountId}`;
  const open = (name: string) => openDB(name, DB_VERSION, { upgrade(d) { if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); } });
  const dst = await open(target);
  if (await dst.get('kv', 'legacy_import')) { dst.close(); return { found: false, copied: {}, at: 0, note: '이미 이관됨' }; }
  const src = await open(LEGACY_DB_NAME);
  const copied: Record<string, number> = {};
  let legacyBal: number | undefined;
  const tx = dst.transaction('kv', 'readwrite');
  for (const k of LEGACY_KEYS) {
    const v = await src.get('kv', k);
    if (v === undefined) continue;
    tx.objectStore('kv').put(v, k);
    copied[k] = Array.isArray(v) ? v.length : typeof v === 'object' && v ? Object.values(v as Record<string, unknown>).reduce<number>((a, x) => a + (Array.isArray(x) ? x.length : 1), 0) : 1;
  }
  const w = (await src.get('kv', 'wallet')) as Wallet | undefined;
  if (w) legacyBal = w.balance;
  const found = Object.keys(copied).length > 0;
  const report: LegacyReport = { found, copied, at: Date.now(), legacyWalletBalance: legacyBal, note: found ? '기존 기기 기록을 복사했습니다 (원본 DB는 그대로 보존). 옛 통장 잔액은 검증되지 않은 값이라 가져오지 않았습니다.' : '이 기기에 이관할 기존 기록이 없습니다' };
  tx.objectStore('kv').put(report, 'legacy_import');
  await tx.done;
  src.close(); dst.close();
  return report;
}

/** 전체 백업 (JSON + SHA-256 체크섬). 파괴적 초기화 전에 사용자가 직접 내려받는다. */
export async function exportBackup(): Promise<{ text: string; sha256: string }> {
  const db = await getDb();
  const keys = await db.getAllKeys('kv');
  const data: Record<string, unknown> = {};
  for (const k of keys) data[String(k)] = await db.get('kv', k);
  const text = JSON.stringify({ app: 'poker-arena', kind: 'full-backup', db: DB_NAME, exportedAt: new Date().toISOString(), data });
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return { text, sha256: [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('') };
}
