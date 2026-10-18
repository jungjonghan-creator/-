import { Card, hasDuplicates } from './cards';
import { evaluate } from './evaluator';
import { RNG, shuffledDeck } from './rng';
import {
  Action, AllInAction, GameConfig, GameState, HandEvent, HandRecord, HandResult, LegalActions, Player, PotResult, Street,
} from './types';

export class IllegalActionError extends Error {}

// ───────────── 생성 ─────────────
export function makePlayer(id: string, name: string, stack: number, isHuman: boolean, aiId?: string): Player {
  return {
    id, name, isHuman, aiId, stack, inHand: false, hole: [], bet: 0, invested: 0, folded: false,
    allIn: false, acted: false, lastActBet: null, lastAction: '', busted: false,
  };
}

export function createGame(config: GameConfig, players: Player[], seed: number): GameState {
  if (players.length < 2 || players.length > config.maxSeats) throw new Error('invalid player count');
  return {
    version: 1, config, handNo: 0, button: players.length - 1, seed, players, street: 'complete', board: [], deck: [], deckPos: 0,
    burned: [], currentBet: 0, minRaise: config.bb, toAct: null, events: [], actionLog: [], result: null,
    totalChips: players.reduce((s, p) => s + p.stack, 0), startStacks: [], sbSeat: -1, bbSeat: -1, gameOver: false, ledger: [],
  };
}

const clone = <T,>(x: T): T => structuredClone(x);

// ───────────── 좌석 유틸 ─────────────
export function nextSeat(s: GameState, from: number, pred: (p: Player, i: number) => boolean): number {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(s.players[i], i)) return i;
  }
  return -1;
}
const alive = (p: Player) => !p.busted && p.stack > 0;
export const liveCount = (s: GameState) => s.players.filter((p) => !p.busted && p.stack > 0).length;
const inPlay = (p: Player) => p.inHand && !p.folded;
const canAct = (p: Player) => p.inHand && !p.folded && !p.allIn;

export function potTotal(s: GameState): number {
  return s.players.reduce((t, p) => t + p.invested, 0);
}

// ───────────── 핸드 시작 ─────────────
export function startHand(prev: GameState, rng: RNG): GameState {
  const seed = Math.floor(rng.next() * 4294967296);
  return startHandWithDeck(prev, shuffledDeck(rng), seed);
}

/** 확정된 덱으로 핸드 시작 (저장 복구/리플레이/테스트용). */
export function startHandWithDeck(prev: GameState, deck: Card[], seed: number, forceButton?: number): GameState {
  if (deck.length !== 52 || hasDuplicates(deck)) throw new Error('invalid deck');
  const s = clone(prev);
  if (s.street !== 'complete') throw new IllegalActionError('hand in progress');
  // 탈락 처리
  for (const p of s.players) if (p.stack <= 0 && !p.busted) p.busted = true;
  if (liveCount(s) < 2) { s.gameOver = true; return s; }

  s.handNo += 1;
  s.seed = seed;
  s.button = forceButton ?? nextSeat(s, s.button, (p) => alive(p));
  s.board = []; s.burned = []; s.events = []; s.actionLog = []; s.result = null;
  s.currentBet = 0; s.minRaise = s.config.bb;
  s.totalChips = s.players.reduce((t, p) => t + p.stack, 0);
  s.startStacks = s.players.map((p) => p.stack);
  for (const p of s.players) {
    p.hole = []; p.bet = 0; p.invested = 0; p.folded = false; p.allIn = false; p.acted = false;
    p.lastActBet = null; p.lastAction = ''; p.inHand = alive(p);
  }
  s.deck = [...deck]; s.deckPos = 0;

  const live = s.players.filter((p) => p.inHand).length;
  // 헤즈업: 버튼=SB. 그 외: 버튼 다음이 SB.
  s.sbSeat = live === 2 ? s.button : nextSeat(s, s.button, (p) => p.inHand);
  s.bbSeat = nextSeat(s, s.sbSeat, (p) => p.inHand);

  // 앤티
  if (s.config.ante > 0) {
    s.players.forEach((p, i) => { if (p.inHand) post(s, i, s.config.ante, 'ante', false); });
  }
  // 홀카드: SB부터 시계방향으로 한 장씩 두 번
  const order: number[] = [];
  let c = s.sbSeat;
  for (let k = 0; k < s.players.length; k++) { if (s.players[c].inHand) order.push(c); c = (c + 1) % s.players.length; }
  for (let r = 0; r < 2; r++) for (const i of order) s.players[i].hole.push(s.deck[s.deckPos++]);

  post(s, s.sbSeat, s.config.sb, 'sb', true);
  post(s, s.bbSeat, s.config.bb, 'bb', true);
  s.currentBet = Math.max(s.players[s.sbSeat].bet, s.players[s.bbSeat].bet);
  s.street = 'preflop';
  // 선행동: 헤즈업은 버튼(SB), 그 외는 BB 다음
  s.toAct = null;
  const first = live === 2 ? s.sbSeat : nextSeat(s, s.bbSeat, (p) => p.inHand);
  s.toAct = findNextActor(s, first - 1 < 0 ? s.players.length - 1 : first - 1);
  if (s.toAct === null) return settleRound(s);
  return s;
}

function post(s: GameState, seat: number, amount: number, kind: 'sb' | 'bb' | 'ante', isBlind: boolean) {
  const p = s.players[seat];
  const pay = Math.min(amount, p.stack);
  const potBefore = potTotal(s);
  p.stack -= pay; p.invested += pay;
  if (isBlind) p.bet += pay;
  if (p.stack === 0) p.allIn = true;
  s.events.push({ seq: s.events.length, street: 'preflop', seat, type: kind, paid: pay, toTotal: p.bet, potBefore, allIn: p.allIn });
}

// ───────────── 합법 행동 ─────────────
export function raiseRights(s: GameState, p: Player): boolean {
  return p.lastActBet === null || s.currentBet - p.lastActBet >= s.minRaise;
}

export function legalActions(s: GameState): LegalActions | null {
  if (s.toAct === null) return null;
  const seat = s.toAct;
  const p = s.players[seat];
  const toCall = Math.max(0, s.currentBet - p.bet);
  const maxTo = p.bet + p.stack;
  const others = s.players.some((q, i) => i !== seat && canAct(q));
  const canRaise = p.stack > toCall && raiseRights(s, p) && others;
  const minTo = Math.min(maxTo, s.currentBet === 0 ? s.config.bb : s.currentBet + s.minRaise);
  return {
    seat, canFold: toCall > 0, canCheck: toCall === 0, canCall: toCall > 0,
    callAmount: Math.min(toCall, p.stack), canRaise, isBet: s.currentBet === 0, minTo, maxTo, pot: potTotal(s),
  };
}

export function validateAction(s: GameState, a: Action | AllInAction): Action {
  const la = legalActions(s);
  if (!la) throw new IllegalActionError('no action allowed');
  const p = s.players[la.seat];
  if (a.type === 'allin') {
    if (la.canRaise) return { type: la.isBet ? 'bet' : 'raise', to: la.maxTo };
    if (la.canCall) return { type: 'call' };
    throw new IllegalActionError('cannot go all-in');
  }
  switch (a.type) {
    case 'fold':
      if (!la.canFold) throw new IllegalActionError('cannot fold when check is free');
      return a;
    case 'check':
      if (!la.canCheck) throw new IllegalActionError('cannot check facing a bet');
      return a;
    case 'call':
      if (!la.canCall) throw new IllegalActionError('nothing to call');
      return a;
    case 'bet': case 'raise': {
      if (!la.canRaise) throw new IllegalActionError('raise not allowed');
      if ((a.type === 'bet') !== la.isBet) throw new IllegalActionError(la.isBet ? 'use bet' : 'use raise');
      const to = a.to;
      if (typeof to !== 'number' || !Number.isInteger(to)) throw new IllegalActionError('amount must be integer');
      if (to > la.maxTo) throw new IllegalActionError('exceeds stack');
      if (to < la.minTo && to !== la.maxTo) throw new IllegalActionError('below minimum raise');
      if (to <= s.currentBet) throw new IllegalActionError('must exceed current bet');
      void p;
      return a;
    }
  }
}

// ───────────── 행동 적용 ─────────────
export function applyAction(prev: GameState, input: Action | AllInAction): GameState {
  const act = validateAction(prev, input);
  const s = clone(prev);
  const seat = s.toAct as number;
  const p = s.players[seat];
  const potBefore = potTotal(s);
  let paid = 0;
  const wasAllInInput = input.type === 'allin';

  if (act.type === 'fold') { p.folded = true; p.lastAction = '폴드'; }
  else if (act.type === 'check') { p.lastAction = '체크'; }
  else if (act.type === 'call') {
    paid = Math.min(s.currentBet - p.bet, p.stack);
    p.stack -= paid; p.bet += paid; p.invested += paid;
    p.lastAction = p.stack === 0 ? '콜 올인' : '콜';
  } else {
    const to = act.to as number;
    paid = to - p.bet;
    const inc = to - s.currentBet;
    p.stack -= paid; p.bet = to; p.invested += paid;
    if (inc >= s.minRaise) s.minRaise = inc;
    s.currentBet = to;
    for (let i = 0; i < s.players.length; i++) if (i !== seat && canAct(s.players[i])) s.players[i].acted = false;
    p.lastAction = p.stack === 0 ? '올인' : act.type === 'bet' ? '베팅' : '레이즈';
  }
  if (p.stack === 0 && act.type !== 'fold') p.allIn = true;
  p.acted = true;
  p.lastActBet = s.currentBet;

  s.events.push({ seq: s.events.length, street: s.street, seat, type: act.type, paid, toTotal: p.bet, potBefore, allIn: p.allIn });
  s.actionLog.push({ seat, action: wasAllInInput ? { type: 'allin' } : act });

  return advance(s, seat);
}

function findNextActor(s: GameState, from: number): number | null {
  const ableCount = s.players.filter(canAct).length;
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    const p = s.players[i];
    if (!canAct(p)) continue;
    if (p.bet < s.currentBet) return i;
    if (!p.acted && ableCount >= 2) return i;
  }
  return null;
}

function advance(s: GameState, from: number): GameState {
  const remaining = s.players.filter(inPlay);
  if (remaining.length === 1) return finishByFold(s);
  const next = findNextActor(s, from);
  if (next !== null) { s.toAct = next; return s; }
  return settleRound(s);
}

function dealStreet(s: GameState) {
  s.burned.push(s.deck[s.deckPos++]);
  const n = s.board.length === 0 ? 3 : 1;
  for (let i = 0; i < n; i++) s.board.push(s.deck[s.deckPos++]);
}

/** 베팅 라운드 종료 → 다음 스트리트 또는 쇼다운 */
function settleRound(s: GameState): GameState {
  s.toAct = null;
  for (;;) {
    for (const p of s.players) { p.bet = 0; p.acted = false; p.lastActBet = null; }
    s.currentBet = 0; s.minRaise = s.config.bb;
    if (s.street === 'river') return showdown(s);
    const next: Street = s.street === 'preflop' ? 'flop' : s.street === 'flop' ? 'turn' : 'river';
    s.street = next;
    dealStreet(s);
    const able = s.players.filter(canAct).length;
    if (able >= 2) {
      // 포스트플랍: 버튼 다음 첫 활성 플레이어
      s.toAct = nextSeat(s, s.button, canAct);
      return s;
    }
    // 올인 런아웃: 더 이상 베팅 불가 → 다음 스트리트로 계속
  }
}

function finishByFold(s: GameState): GameState {
  s.toAct = null;
  const res = distribute(s, true);
  s.result = res; s.street = 'complete';
  applyResult(s, res);
  return s;
}

function showdown(s: GameState): GameState {
  s.street = 'showdown';
  const res = distribute(s, false);
  s.result = res;
  s.street = 'complete';
  applyResult(s, res);
  return s;
}

// ───────────── 팟 계산 ─────────────
export interface PotLayer { amount: number; eligible: number[] }

/** 미대응 베팅을 분리한 뒤 메인/사이드팟 레이어 구성 */
export function buildPots(players: Player[]): { layers: PotLayer[]; returned: Record<number, number> } {
  const inv = players.map((p) => p.invested);
  const returned: Record<number, number> = {};
  const order = inv.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  if (order.length >= 2 && order[0][0] > order[1][0]) {
    const diff = order[0][0] - order[1][0];
    returned[order[0][1]] = diff;
    inv[order[0][1]] -= diff;
  }
  const levels = [...new Set(players.map((p, i) => (p.folded ? 0 : inv[i])).filter((v) => v > 0))].sort((a, b) => a - b);
  const layers: PotLayer[] = [];
  let prev = 0;
  for (const lv of levels) {
    let amount = 0;
    for (let i = 0; i < inv.length; i++) amount += Math.max(0, Math.min(inv[i], lv) - prev);
    const eligible = players.map((p, i) => i).filter((i) => !players[i].folded && players[i].inHand && inv[i] >= lv);
    if (amount > 0) layers.push({ amount, eligible });
    prev = lv;
  }
  // 폴드한 플레이어가 마지막 레벨 이상 투입한 데드머니 (최상위 레벨 초과분)
  let dead = 0;
  for (let i = 0; i < inv.length; i++) dead += Math.max(0, inv[i] - prev);
  if (dead > 0 && layers.length) layers[layers.length - 1].amount += dead;
  return { layers, returned };
}

function distribute(s: GameState, byFold: boolean): HandResult {
  const { layers, returned } = buildPots(s.players);
  const pots: PotResult[] = [];
  const winnings: Record<number, number> = {};
  const shown: HandResult['shown'] = {};
  const scores: Record<number, number> = {};
  if (!byFold) {
    s.players.forEach((p, i) => {
      if (inPlay(p)) { const sc = evaluate([...p.hole, ...s.board]); scores[i] = sc; shown[i] = { hole: [...p.hole], score: sc }; }
    });
  }
  // 칩 홀수 분배 순서: 버튼 왼쪽부터
  const seatOrder = (a: number, b: number) => ((a - s.button - 1 + 100 * s.players.length) % s.players.length) - ((b - s.button - 1 + 100 * s.players.length) % s.players.length);
  for (const layer of layers) {
    let winners: number[];
    if (byFold) winners = layer.eligible.length ? layer.eligible : [];
    else {
      const best = Math.max(...layer.eligible.map((i) => scores[i]));
      winners = layer.eligible.filter((i) => scores[i] === best);
    }
    winners.sort(seatOrder);
    const base = Math.floor(layer.amount / winners.length);
    let rem = layer.amount - base * winners.length;
    const share: Record<number, number> = {};
    for (const w of winners) { const extra = rem > 0 ? 1 : 0; rem -= extra; share[w] = base + extra; winnings[w] = (winnings[w] ?? 0) + share[w]; }
    pots.push({ amount: layer.amount, eligible: layer.eligible, winners, share });
  }
  const net: Record<number, number> = {};
  s.players.forEach((p, i) => {
    if (!p.inHand) return;
    net[i] = (winnings[i] ?? 0) + (returned[i] ?? 0) - p.invested;
  });
  // 병합 가능한 인접 동일 자격 팟은 UI에서 처리. 엔진은 레이어 그대로 보존.
  return { pots, net, returned, shown, endedByFold: byFold };
}

function applyResult(s: GameState, res: HandResult) {
  for (const [seatStr, delta] of Object.entries(res.net)) {
    const i = Number(seatStr);
    const p = s.players[i];
    p.stack += p.invested + delta; // 투입분 환원 후 순손익 반영
  }
  s.players.forEach((p) => { p.bet = 0; });
  // 칩 보존 검사
  const sum = s.players.reduce((t, p) => t + p.stack, 0);
  if (sum !== s.totalChips) throw new Error(`chip conservation violated: ${sum} != ${s.totalChips}`);
  // 탈락
  const busted = s.players.filter((p) => !p.busted && p.stack === 0);
  const alivePrev = s.players.filter((p) => !p.busted).length;
  const startOf = (p: Player) => s.startStacks[s.players.indexOf(p)];
  busted.sort((a, b) => startOf(b) - startOf(a));
  busted.forEach((p, k) => { p.busted = true; p.finishPlace = alivePrev - busted.length + 1 + k; });
  if (s.players.filter((p) => !p.busted).length < 2) {
    s.gameOver = true;
    const w = s.players.find((p) => !p.busted);
    if (w) w.finishPlace = 1;
  }
}

// ───────────── 불변식 / 기록 ─────────────
export function checkInvariants(s: GameState): string[] {
  const errs: string[] = [];
  const dealt: Card[] = s.deck.slice(0, s.deckPos);
  const all = [...s.deck];
  if (s.deck.length && (all.length !== 52 || hasDuplicates(all))) errs.push('deck not 52 unique');
  const seen: Card[] = [...s.players.flatMap((p) => p.hole), ...s.board, ...s.burned];
  if (hasDuplicates(seen)) errs.push('duplicate dealt card');
  if (seen.length !== dealt.length && s.deck.length) errs.push('dealt count mismatch');
  for (const c of seen) if (!dealt.includes(c)) errs.push('card not from deck prefix');
  if (s.players.some((p) => p.stack < 0 || !Number.isInteger(p.stack))) errs.push('invalid stack');
  if (s.street !== 'complete' || s.result === null) {
    if (s.street !== 'complete') {
      const total = s.players.reduce((t, p) => t + p.stack + p.invested, 0);
      if (total !== s.totalChips) errs.push(`chips ${total} != ${s.totalChips}`);
    }
  } else {
    const total = s.players.reduce((t, p) => t + p.stack, 0);
    if (total !== s.totalChips) errs.push(`chips(after) ${total} != ${s.totalChips}`);
  }
  return errs;
}

export function toHandRecord(s: GameState): HandRecord {
  return {
    handNo: s.handNo, seed: s.seed, deck: [...s.deck], button: s.button, config: s.config,
    startStacks: s.players.map((p, i) => ({ id: p.id, name: p.name, stack: s.startStacks[i], seat: i, busted: p.busted && s.startStacks[i] === 0 })),
    events: s.events, actions: s.actionLog, board: [...s.board],
    holes: Object.fromEntries(s.players.map((p, i) => [i, [...p.hole]]).filter(([, h]) => (h as Card[]).length)),
    result: s.result,
  };
}

export type { HandEvent };
