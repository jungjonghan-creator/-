/**
 * 서버 지갑 저장소. 순수 도메인 함수(src/economy/wallet.ts)를 그대로 쓰고, 결과를 DB 에 원자적으로 반영한다.
 * 이중 안전장치: (1) 낙관적 잠금(version+last_op) (2) (account_id, tx_id) PK — 같은 거래는 DB 수준에서 두 번 들어갈 수 없다.
 */
import * as W from '../src/economy/wallet';
import type { Db, Stmt } from './db';
import { randomId } from './crypto';

export class RecoveryRequired extends Error {}

export async function loadWallet(db: Db, accountId: string): Promise<{ wallet: W.Wallet; version: number } | null> {
  const row = await db.prepare('SELECT version, initial, balance, peak, created FROM wallets WHERE account_id=?').bind(accountId).first<{ version: number; initial: number; balance: number; peak: number; created: number }>();
  if (!row) return null;
  const txs = (await db.prepare('SELECT tx_id, ts, kind, amount, ref, note, balance_after FROM wallet_txs WHERE account_id=? ORDER BY seq').bind(accountId).all<{ tx_id: string; ts: number; kind: W.TxKind; amount: number; ref: string; note: string; balance_after: number }>()).results;
  const accs = (await db.prepare('SELECT json FROM wallet_accounts WHERE account_id=?').bind(accountId).all<{ json: string }>()).results;
  const accounts: Record<string, W.Account> = {};
  for (const a of accs) { const o = JSON.parse(a.json) as W.Account; accounts[o.id] = o; }
  const wallet: W.Wallet = { version: 1, initial: row.initial, balance: row.balance, peak: row.peak, created: row.created, txs: txs.map((t) => ({ id: t.tx_id, ts: t.ts, kind: t.kind, amount: t.amount, ref: t.ref, note: t.note, balanceAfter: t.balance_after })), accounts };
  return { wallet, version: row.version };
}

export async function createWallet(db: Db, accountId: string, now: number, initial = W.INITIAL_BALANCE): Promise<W.Wallet> {
  const w = W.newWallet(now, initial);
  await db.batch([
    db.prepare('INSERT INTO wallets(account_id, version, initial, balance, peak, created, last_op) VALUES (?,?,?,?,?,?,?)').bind(accountId, 0, initial, initial, initial, now, 'init'),
    db.prepare('INSERT INTO wallet_txs(account_id, tx_id, seq, ts, kind, amount, ref, note, balance_after) VALUES (?,?,?,?,?,?,?,?,?)').bind(accountId, 'initial', 0, now, 'initial', 0, '', w.txs[0].note, initial),
  ]);
  return w;
}

const guard = (accountId: string, op: string) => ({ sql: 'EXISTS(SELECT 1 FROM wallets WHERE account_id=? AND last_op=?)', binds: [accountId, op] });

/**
 * 지갑 연산을 낙관적 잠금으로 적용한다. `extra` 는 같은 원자 배치에 포함될 추가 문장(가드 포함)을 만든다.
 * 같은 연산의 재시도는 tx id 멱등성 덕에 안전하다.
 */
export async function mutateWallet(
  db: Db, accountId: string, op: (w: W.Wallet) => W.Wallet,
  extra?: (g: { sql: string; binds: unknown[] }, next: W.Wallet) => Stmt[],
): Promise<W.Wallet> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await loadWallet(db, accountId);
    if (!cur) throw new Error('지갑 없음');
    const errs = W.verifyWallet(cur.wallet);
    if (errs.length) throw new RecoveryRequired(`RECONCILIATION_REQUIRED: ${errs[0]}`);
    const next = op(cur.wallet);
    if (next === cur.wallet) return cur.wallet; // 멱등 no-op
    const token = randomId();
    const g = guard(accountId, token);
    const stmts: Stmt[] = [
      db.prepare('UPDATE wallets SET version=version+1, balance=?, peak=?, last_op=? WHERE account_id=? AND version=?').bind(next.balance, next.peak, token, accountId, cur.version),
    ];
    for (let i = cur.wallet.txs.length; i < next.txs.length; i++) {
      const t = next.txs[i];
      stmts.push(db.prepare(`INSERT INTO wallet_txs(account_id, tx_id, seq, ts, kind, amount, ref, note, balance_after) SELECT ?,?,?,?,?,?,?,?,? WHERE ${g.sql}`).bind(accountId, t.id, i, t.ts, t.kind, t.amount, t.ref, t.note, t.balanceAfter, ...g.binds));
    }
    for (const [sid, a] of Object.entries(next.accounts)) {
      if (JSON.stringify(cur.wallet.accounts[sid]) !== JSON.stringify(a)) stmts.push(db.prepare(`INSERT OR REPLACE INTO wallet_accounts(account_id, sid, json) SELECT ?,?,? WHERE ${g.sql}`).bind(accountId, sid, JSON.stringify(a), ...g.binds));
    }
    if (extra) stmts.push(...extra(g, next));
    try { await db.batch(stmts); } catch (e) {
      // 같은 거래가 이미 반영됨(동시 요청) 또는 다른 제약 위반 → 현재 상태를 다시 읽어 재시도
      const again = await loadWallet(db, accountId);
      if (again && again.version !== cur.version) continue;
      throw e;
    }
    const check = await db.prepare('SELECT last_op FROM wallets WHERE account_id=?').bind(accountId).first<{ last_op: string }>();
    if (check?.last_op === token) return next;
    // 다른 요청이 먼저 반영 → 재시도
  }
  throw new Error('동시 요청 충돌: 잠시 후 다시 시도하세요');
}
