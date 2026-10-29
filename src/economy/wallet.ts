/**
 * 영구 게임 통장 (가상 크레딧 전용 — 현금/결제와 무관).
 * 모든 입출금은 고유 id 를 가진 원장(tx)으로 기록되고, 같은 id 는 두 번 적용되지 않는다(멱등).
 * 잔액 = 초기 지급 + Σ(tx.amount) 이며 어떤 거래도 잔액을 음수로 만들 수 없다.
 */
export const INITIAL_BALANCE = 30000;

export type TxKind =
  | 'initial' | 'cash-buyin' | 'cash-topup' | 'cash-cashout'
  | 'tourney-entry' | 'tourney-fee' | 'tourney-reentry' | 'tourney-prize' | 'freeroll-prize' | 'adjust' | 'daily-grant' | 'bounty-prize';

export interface Tx { id: string; ts: number; kind: TxKind; amount: number; ref: string; note: string; balanceAfter: number }

export type AccountKind = 'cash' | 'tournament' | 'freeroll' | 'practice';
export interface Account {
  id: string; kind: AccountKind; label: string; tierId?: string;
  /** 통장에서 나간 총액 (바이인+탑업+참가비+수수료) */
  spent: number;
  /** 통장으로 돌아온 총액 (캐시아웃/상금) */
  returned: number;
  /** 토너먼트: 총 엔트리 수 */
  entries: number;
  status: 'open' | 'closed';
  openedAt: number; closedAt?: number;
  place?: number; fieldSize?: number;
}

export interface Ticket { id: string; eventId: string; season: number; value: number; sourceEntry: string; status: 'active' | 'used'; usedEntry?: string; createdAt: number }
export interface Wallet {
  version: 1;
  /** 새틀라이트 등으로 얻은 일회성 참가권 (서버 모드에서는 서버 값이 진실) */
  tickets?: Ticket[];
  initial: number;
  balance: number;
  peak: number;
  created: number;
  txs: Tx[];
  accounts: Record<string, Account>;
}

export class InsufficientFunds extends Error {}
export class WalletError extends Error {}

export function newWallet(now = Date.now(), initial = INITIAL_BALANCE): Wallet {
  const w: Wallet = { version: 1, initial, balance: initial, peak: initial, created: now, txs: [], accounts: {} };
  w.txs.push({ id: 'initial', ts: now, kind: 'initial', amount: 0, ref: '', note: `초기 자산 ${initial.toLocaleString()} 크레딧(가상)`, balanceAfter: initial });
  return w;
}

const has = (w: Wallet, id: string) => w.txs.some((t) => t.id === id);

/** 원장 기록. 같은 id 가 이미 있으면 아무 것도 하지 않는다(멱등). */
function post(w: Wallet, tx: { id: string; ts: number; kind: TxKind; amount: number; ref: string; note: string }): Wallet {
  if (has(w, tx.id)) return w;
  if (!Number.isInteger(tx.amount)) throw new WalletError('금액은 정수여야 합니다');
  const balance = w.balance + tx.amount;
  if (balance < 0) throw new InsufficientFunds(`잔액이 부족합니다 (필요 ${(-tx.amount).toLocaleString()}, 보유 ${w.balance.toLocaleString()})`);
  return { ...w, balance, peak: Math.max(w.peak, balance), txs: [...w.txs, { ...tx, balanceAfter: balance }] };
}

function withAccount(w: Wallet, a: Account): Wallet { return { ...w, accounts: { ...w.accounts, [a.id]: a } }; }
const mustAccount = (w: Wallet, sid: string): Account => { const a = w.accounts[sid]; if (!a) throw new WalletError(`계정 없음: ${sid}`); return a; };

// ───────── 캐시게임 ─────────
export function openCash(w: Wallet, sid: string, label: string, buyIn: number, limits: { min: number; max: number }, now = Date.now()): Wallet {
  if (w.accounts[sid]) return w; // 같은 세션을 두 번 열어도 한 번만 차감
  if (!Number.isInteger(buyIn) || buyIn < limits.min || buyIn > limits.max) throw new WalletError(`바이인은 ${limits.min.toLocaleString()}~${limits.max.toLocaleString()} 사이여야 합니다`);
  let n = post(w, { id: `cash-buyin:${sid}`, ts: now, kind: 'cash-buyin', amount: -buyIn, ref: sid, note: `${label} 바이인` });
  n = withAccount(n, { id: sid, kind: 'cash', label, spent: buyIn, returned: 0, entries: 1, status: 'open', openedAt: now });
  return n;
}
/** 테이블에서 칩을 추가로 꺼내 온다 (탑업/리바이). opId 가 같으면 한 번만 차감. */
export function cashTopUp(w: Wallet, sid: string, opId: string, amount: number, limits: { max: number; currentChips: number }, now = Date.now()): Wallet {
  const a = mustAccount(w, sid);
  if (a.status !== 'open') throw new WalletError('이미 종료된 경기입니다');
  const id = `cash-topup:${sid}:${opId}`;
  if (has(w, id)) return w;
  if (!Number.isInteger(amount) || amount <= 0) throw new WalletError('금액이 올바르지 않습니다');
  if (limits.currentChips + amount > limits.max) throw new WalletError(`테이블 최대 바이인(${limits.max.toLocaleString()})을 넘을 수 없습니다`);
  const n = post(w, { id, ts: now, kind: 'cash-topup', amount: -amount, ref: sid, note: `${a.label} 추가 바이인` });
  return withAccount(n, { ...a, spent: a.spent + amount });
}
/** 테이블을 떠난다: 남은 테이블 칩만 통장으로 돌아온다. 두 번 호출해도 한 번만 지급. */
export function closeCash(w: Wallet, sid: string, chips: number, now = Date.now()): Wallet {
  const a = mustAccount(w, sid);
  if (a.status === 'closed') return w;
  if (!Number.isInteger(chips) || chips < 0) throw new WalletError('칩 수가 올바르지 않습니다');
  let n = w;
  if (chips > 0) n = post(n, { id: `cash-cashout:${sid}`, ts: now, kind: 'cash-cashout', amount: chips, ref: sid, note: `${a.label} 퇴장 정산` });
  return withAccount(n, { ...a, returned: a.returned + chips, status: 'closed', closedAt: now });
}

// ───────── 토너먼트 ─────────
export interface TourneyCost { id: string; name: string; buyIn: number; fee: number }
export function enterTournament(w: Wallet, sid: string, t: TourneyCost, kind: 'tournament' | 'freeroll' = 'tournament', now = Date.now(), ticket = false): Wallet {
  if (w.accounts[sid]) return w; // 중복 등록 방지
  if (ticket) return withAccount(w, { id: sid, kind, label: `${t.name} (티켓 입장)`, tierId: t.id, spent: 0, returned: 0, entries: 1, status: 'open', openedAt: now });
  const cost = t.buyIn + t.fee;
  if (w.balance < cost) throw new InsufficientFunds(`참가비가 부족합니다 (필요 ${cost.toLocaleString()}, 보유 ${w.balance.toLocaleString()})`);
  let n = w;
  if (t.buyIn > 0) n = post(n, { id: `entry:${sid}:1`, ts: now, kind: 'tourney-entry', amount: -t.buyIn, ref: sid, note: `${t.name} 참가비` });
  if (t.fee > 0) n = post(n, { id: `fee:${sid}:1`, ts: now, kind: 'tourney-fee', amount: -t.fee, ref: sid, note: `${t.name} 수수료` });
  return withAccount(n, { id: sid, kind, label: t.name, tierId: t.id, spent: cost, returned: 0, entries: 1, status: 'open', openedAt: now });
}
export function reenterTournament(w: Wallet, sid: string, t: TourneyCost, entryNo: number, now = Date.now()): Wallet {
  const a = mustAccount(w, sid);
  if (a.status !== 'open') throw new WalletError('이미 종료된 대회입니다');
  const id = `reentry:${sid}:${entryNo}`;
  if (has(w, id)) return w;
  const cost = t.buyIn + t.fee;
  const n = post(w, { id, ts: now, kind: 'tourney-reentry', amount: -cost, ref: sid, note: `${t.name} 재진입 ${entryNo}` });
  return withAccount(n, { ...a, spent: a.spent + cost, entries: a.entries + 1 });
}
/** 상금 지급 (대회당 한 번). 상금이 0 이어도 대회는 종료 처리된다. */
export function payPrize(w: Wallet, sid: string, amount: number, place: number, fieldSize: number, now = Date.now(), bounty = 0): Wallet {
  const a = mustAccount(w, sid);
  if (a.status === 'closed') return w;
  let n = w;
  if (amount > 0) n = post(n, { id: `prize:${sid}`, ts: now, kind: a.kind === 'freeroll' ? 'freeroll-prize' : 'tourney-prize', amount, ref: sid, note: `${a.label} ${place}위 상금` });
  if (bounty > 0) n = post(n, { id: `bounty:${sid}`, ts: now, kind: 'bounty-prize', amount: bounty, ref: sid, note: `${a.label} 바운티 획득` });
  return withAccount(n, { ...a, returned: a.returned + Math.max(0, amount) + Math.max(0, bounty), status: 'closed', closedAt: now, place, fieldSize });
}
/** 연습게임: 통장과 무관하게 계정만 기록 */
export function openPractice(w: Wallet, sid: string, label: string, now = Date.now()): Wallet {
  if (w.accounts[sid]) return w;
  return withAccount(w, { id: sid, kind: 'practice', label, spent: 0, returned: 0, entries: 1, status: 'open', openedAt: now });
}
export function closePractice(w: Wallet, sid: string, now = Date.now()): Wallet {
  const a = w.accounts[sid];
  if (!a || a.status === 'closed') return w;
  return withAccount(w, { ...a, status: 'closed', closedAt: now });
}
/** 세션 데이터가 사라진 열린 계정은 정산 없이 종료(몰수) — 새로고침/삭제로 손실을 되돌리는 것을 막는다. */
export function forfeit(w: Wallet, sid: string, now = Date.now()): Wallet {
  const a = w.accounts[sid];
  if (!a || a.status === 'closed') return w;
  return withAccount(w, { ...a, status: 'closed', closedAt: now });
}

// ───────── 조회/검증 ─────────
export function atTable(w: Wallet): number {
  return Object.values(w.accounts).filter((a) => a.status === 'open' && a.kind !== 'practice').reduce((t, a) => t + a.spent - a.returned, 0);
}
export interface WalletSummary {
  balance: number; atTable: number; peak: number;
  cashNet: number; cashSessions: number;
  tourneyEntries: number; tourneyCost: number; tourneyPrizes: number; tourneyNet: number; roi: number | null; itm: number; wins: number; tourneys: number;
  totalNet: number;
  /** 누적 바이인(캐시+탑업) / 누적 토너먼트 수수료 / 전체 수익률 */
  cashBuyIns: number; feesPaid: number; overallRoi: number | null;
}
export function summarize(w: Wallet): WalletSummary {
  const acc = Object.values(w.accounts);
  const cash = acc.filter((a) => a.kind === 'cash' && a.status === 'closed');
  const tour = acc.filter((a) => (a.kind === 'tournament') && a.status === 'closed');
  const cashNet = cash.reduce((t, a) => t + a.returned - a.spent, 0);
  const cost = tour.reduce((t, a) => t + a.spent, 0);
  const prizes = tour.reduce((t, a) => t + a.returned, 0);
  const grants = w.txs.filter((t) => t.kind === 'daily-grant').reduce((a, t) => a + t.amount, 0);
  const total = w.balance + atTable(w) - w.initial - grants; // 무료 지급분은 손익에서 제외
  return {
    balance: w.balance, atTable: atTable(w), peak: w.peak, cashNet, cashSessions: cash.length,
    tourneyEntries: tour.reduce((t, a) => t + a.entries, 0), tourneyCost: cost, tourneyPrizes: prizes, tourneyNet: prizes - cost, roi: cost ? (prizes - cost) / cost : null,
    itm: tour.filter((a) => a.returned > 0).length, wins: tour.filter((a) => a.place === 1).length, tourneys: tour.length, totalNet: total,
    cashBuyIns: 0 - w.txs.filter((t) => t.kind === 'cash-buyin' || t.kind === 'cash-topup').reduce((s, t) => s + t.amount, 0),
    feesPaid: 0 - w.txs.filter((t) => t.kind === 'tourney-fee').reduce((s, t) => s + t.amount, 0),
    overallRoi: (() => { const done = acc.filter((a) => a.kind !== 'practice' && a.status === 'closed'); const sp = done.reduce((s, a) => s + a.spent, 0); return sp ? (done.reduce((s, a) => s + a.returned, 0) - sp) / sp : null; })(),
  };
}

/** 무결성 검사: 잔액 = 초기 + Σ원장, id 유일, 중간 잔액 음수 없음, balanceAfter 일관 */
export function verifyWallet(w: Wallet): string[] {
  const errs: string[] = [];
  if (w.version !== 1) errs.push(`지원하지 않는 통장 버전 ${w.version}`);
  let bal = w.initial;
  const seen = new Set<string>();
  for (const t of w.txs) {
    if (seen.has(t.id)) errs.push(`중복 거래 id: ${t.id}`);
    seen.add(t.id);
    if (!Number.isInteger(t.amount)) errs.push(`정수가 아닌 금액: ${t.id}`);
    bal += t.amount;
    if (bal < 0) errs.push(`잔액이 음수가 된 거래: ${t.id}`);
    if (t.balanceAfter !== bal) errs.push(`거래 후 잔액 불일치: ${t.id}`);
  }
  if (bal !== w.balance) errs.push(`잔액 불일치: 원장 ${bal} vs 저장 ${w.balance}`);
  if (w.balance < 0) errs.push('음수 잔액');
  for (const a of Object.values(w.accounts)) {
    const ts = w.txs.filter((t) => t.ref === a.id);
    const spent = -ts.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    const ret = ts.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    if (a.kind !== 'practice' && (spent !== a.spent || ret !== a.returned)) errs.push(`계정 ${a.id}: 원장(지출 ${spent}/수입 ${ret})과 계정(${a.spent}/${a.returned}) 불일치`);
  }
  return errs;
}

/** 손상 복구용: 열린 계정에서 나간 금액 중 돌려받지 못한 부분을 환불하고 계정을 닫는다. */
export function refundOpen(w: Wallet, sid: string, now = Date.now()): Wallet {
  const a = w.accounts[sid];
  if (!a || a.status === 'closed') return w;
  const refund = Math.max(0, a.spent - a.returned);
  let n = w;
  if (refund > 0 && a.kind !== 'practice') n = post(n, { id: `refund:${sid}`, ts: now, kind: 'adjust', amount: refund, ref: sid, note: `${a.label} 저장 데이터 손상으로 환불` });
  return withAccount(n, { ...a, returned: a.returned + (a.kind !== 'practice' ? refund : 0), status: 'closed', closedAt: now });
}

// ───────── 정기 무료 크레딧 ─────────
/** 하루 한 번(KST 달력일), 보유 자산(통장+테이블)이 상한 미만일 때만, 상한까지 채워 최대 DAILY_GRANT. 무료 발행분이며 상금 풀 원천이 아니다. */
export const DAILY_GRANT = 3000;
export const GRANT_CAP = 30000;
export const kstDate = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
export function dailyGrant(w: Wallet, now = Date.now()): { wallet: Wallet; granted: number; reason?: string } {
  const key = `daily:${kstDate(now)}`;
  if (has(w, key)) return { wallet: w, granted: 0, reason: '오늘은 이미 받았습니다' };
  const holdings = w.balance + atTable(w);
  const amount = Math.min(DAILY_GRANT, GRANT_CAP - holdings);
  if (amount <= 0) return { wallet: w, granted: 0, reason: `보유 자산이 ${GRANT_CAP.toLocaleString()} 이상이면 지급되지 않습니다` };
  return { wallet: post(w, { id: key, ts: now, kind: 'daily-grant', amount, ref: '', note: `정기 무료 크레딧 ${kstDate(now)}` }), granted: amount };
}

// ───────── 티켓 (새틀라이트) ─────────
export function grantTicket(w: Wallet, t: Omit<Ticket, 'status' | 'createdAt'>, now = Date.now()): Wallet {
  if ((w.tickets ?? []).some((x) => x.id === t.id || x.sourceEntry === t.sourceEntry)) return w; // 같은 새틀라이트 결과로 두 번 발행 불가
  return { ...w, tickets: [...(w.tickets ?? []), { ...t, status: 'active', createdAt: now }] };
}
export function useTicketFor(w: Wallet, eventId: string, season: number, entrySid: string): { wallet: Wallet; ticketId: string | null } {
  const t = (w.tickets ?? []).find((x) => x.status === 'active' && x.eventId === eventId && x.season === season);
  if (!t) return { wallet: w, ticketId: null };
  return { wallet: { ...w, tickets: (w.tickets ?? []).map((x) => (x.id === t.id ? { ...x, status: 'used' as const, usedEntry: entrySid } : x)) }, ticketId: t.id };
}
