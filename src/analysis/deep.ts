/**
 * 심층 복기 엔진 — 공개된 행동만으로 상대의 1,326 콤보 가중치를 베이지안으로 추적하고,
 * 선택지(폴드/체크/콜/여러 사이즈의 벳·레이즈)별 EV를 같은 표본(공통 난수)으로 비교한다.
 *
 * 이전 방식(프리플랍 퍼센타일 + 보드 강도 한 줄)과 달리:
 *  - 스트리트마다 액션(체크/벳 크기/콜/레이즈)이 레인지를 좁히는 것을 순서대로 반영한다 (라인 일관성)
 *  - 벳 크기에 따른 양극화(큰 벳=강한 핸드+블러프), 콜 = MDF 기준의 방어 빈도, 블로커·죽은 카드 제거
 *  - 같은 상대에 대해 쌓인 관찰 통계(VPIP·공격성·C-벳 폴드)로 사전 확률을 조정
 *  - 벳/레이즈의 폴드 에퀴티를 "상대 레인지가 그 크기에 계속할 확률"로 계산 (추정이지만 모델이 명시적)
 * 한계: 단일 스트리트 EV(이후 스트리트의 배럴·임플라이드 오즈는 실현율 상수로만 반영). 솔버가 아니다.
 */
import { Card, rankOf, suitOf, cardToString, RANK_CHARS } from '../engine/cards';
import { evaluate } from '../engine/evaluator';
import { RNG } from '../engine/rng';
import { PREFLOP_PCT } from '../ai/preflopTable';
import { handKey } from '../ai/handKey';
import { OPEN_BASE } from '../ai/decide';
import { Observation } from '../ai/observation';
import { OppModel } from '../ai/opponentModel';
import type { HandEvent } from '../engine/types';

// ───────────────────────── 콤보 ─────────────────────────
export interface Combo { a: Card; b: Card; pct: number; suited: boolean; key: string }
export const COMBOS: Combo[] = (() => {
  const out: Combo[] = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
    const key = handKey(a, b);
    out.push({ a, b, pct: PREFLOP_PCT[key] ?? 1, suited: suitOf(a) === suitOf(b), key });
  }
  return out;
})();
const N = COMBOS.length;
const sig = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// ───────────────────────── 보드별 강도 ─────────────────────────
interface BoardInfo { valid: Uint8Array; e: Float64Array; order: Int32Array; semi: Uint8Array }
const boardCache = new Map<string, BoardInfo>();
/** 각 콤보의 메이드핸드 강도 백분위(0~1, 같은 보드의 다른 콤보와 비교)와 드로우 여부 */
function boardInfo(board: Card[]): BoardInfo {
  const k = board.join(',');
  const hit = boardCache.get(k); if (hit) return hit;
  const valid = new Uint8Array(N); const score = new Float64Array(N); const semi = new Uint8Array(N);
  const used = new Set(board);
  const idx: number[] = [];
  for (let i = 0; i < N; i++) {
    const c = COMBOS[i];
    if (used.has(c.a) || used.has(c.b)) continue;
    valid[i] = 1; idx.push(i);
    score[i] = board.length >= 3 ? evaluate([c.a, c.b, ...board]) : c.pct * -1;
    if (board.length >= 3 && board.length < 5) semi[i] = isDraw(c.a, c.b, board) ? 1 : 0;
  }
  idx.sort((x, y) => score[x] - score[y]);
  const e = new Float64Array(N);
  let i = 0;
  while (i < idx.length) {
    let j = i; while (j + 1 < idx.length && score[idx[j + 1]] === score[idx[i]]) j++;
    const p = (i + j) / 2 / Math.max(1, idx.length - 1);
    for (let t = i; t <= j; t++) e[idx[t]] = p;
    i = j + 1;
  }
  const info = { valid, e, order: Int32Array.from(idx), semi };
  if (boardCache.size > 200) boardCache.clear();
  boardCache.set(k, info);
  return info;
}
function isDraw(a: Card, b: Card, board: Card[]): boolean {
  const all = [a, b, ...board];
  const sc = [0, 0, 0, 0]; all.forEach((c) => sc[suitOf(c)]++);
  if (sc.some((n, s) => n === 4 && (suitOf(a) === s || suitOf(b) === s))) return true;
  let m = 0; for (const c of all) m |= 1 << rankOf(c); if (m & (1 << 14)) m |= 2;
  for (let h = 0; h <= 9; h++) { const w = (m >> (h + 1)) & 0b11111; let c = 0; for (let k = 0; k < 5; k++) if (w & (1 << k)) c++; if (c === 4) return true; }
  return false;
}

/** 현재 레인지(가중치 w) 안에서의 분위(0=가장 약함, 1=가장 강함) */
function quantiles(w: Float64Array, info: BoardInfo): Float64Array {
  const q = new Float64Array(N);
  let tot = 0; for (let i = 0; i < N; i++) if (info.valid[i]) tot += w[i];
  if (tot <= 0) return q.fill(0.5);
  let cum = 0; let i = 0; const ord = info.order;
  while (i < ord.length) {
    let j = i; let grp = 0;
    while (j < ord.length && info.e[ord[j]] === info.e[ord[i]]) { grp += w[ord[j]]; j++; }
    const val = (cum + grp / 2) / tot;
    for (let t = i; t < j; t++) q[ord[t]] = val;
    cum += grp; i = j;
  }
  return q;
}

// ───────────────────────── 행동 우도 모델 ─────────────────────────
export interface StyleHint { vpip?: number; pfr?: number; af?: number; fcb?: number; n: number }
const BLUFF3 = new Set(['A5s', 'A4s', 'A3s', 'A2s', 'K9s', 'QJs', 'J9s', 'T9s', '98s', '87s', '76s', '65s', 'KJo', 'KQo']);
const tableScale = (n: number) => (n <= 2 ? 1.5 : n <= 3 ? 1.35 : n <= 6 ? 1.15 : 1);

function openPctOf(pos: string, players: number, hint: StyleHint): number {
  let p = (OPEN_BASE[pos] ?? 0.2) * tableScale(players);
  if (hint.n >= 25 && hint.vpip !== undefined) p *= clamp(hint.vpip / 0.26, 0.55, 1.9);
  return clamp(p, 0.04, 0.9);
}

/** 프리플랍 한 번의 행동이 각 콤보에 줄 우도 */
function preLikelihood(c: Combo, type: 'raise' | 'call' | 'check', ctx: { nRaises: number; pos: string; players: number; limpers: number; toCallBB: number; raiseToBB: number; stackBB: number; allIn: boolean; hint: StyleHint; isBB: boolean }): number {
  const pct = c.pct;
  const open = openPctOf(ctx.pos, ctx.players, ctx.hint) * (ctx.limpers > 0 ? 0.85 : 1);
  if (ctx.allIn && ctx.stackBB <= 20) {
    const jam = clamp(0.12 + (20 - Math.min(20, ctx.stackBB)) * 0.035, 0.08, 0.7);
    return 0.01 + 0.99 * sig((jam - pct) / (0.15 * jam + 0.01));
  }
  if (ctx.nRaises === 0) {
    if (type === 'raise') return 0.02 + 0.98 * sig((open - pct) / (0.18 * open + 0.01));
    if (type === 'check') return ctx.isBB ? 1 - 0.55 * sig((0.1 - pct) / 0.03) : 1;
    // 림프/콜: 중간 강도(너무 강하면 레이즈, 너무 약하면 폴드)
    return 0.04 + 0.9 * sig((0.55 - pct) / 0.1) * sig((pct - open * 0.35) / 0.07);
  }
  if (ctx.nRaises === 1) {
    const size = clamp(ctx.raiseToBB, 2, 12);
    const t3 = 0.05 * (ctx.hint.n >= 25 && ctx.hint.pfr !== undefined ? clamp(ctx.hint.pfr / 0.17, 0.6, 1.8) : 1);
    if (type === 'raise') return 0.01 + sig((t3 - pct) / 0.012) + (BLUFF3.has(c.key) && pct < 0.5 && pct > 0.08 ? 0.07 : 0);
    const cut = clamp((ctx.isBB ? 0.46 : 0.26) - 0.03 * (size - 2.5) + (open - 0.2) * 0.25, 0.08, 0.6);
    return 0.01 + 0.99 * sig((cut - pct) / (0.2 * cut + 0.01)) * (1 - 0.85 * sig((t3 - pct) / 0.012));
  }
  // 3벳 이상
  if (type === 'raise') return 0.01 + sig((0.022 - pct) / 0.008) + (c.key === 'A5s' || c.key === 'A4s' ? 0.1 : 0);
  return 0.01 + 0.99 * sig((0.06 - pct) / 0.015) * (1 - 0.7 * sig((0.012 - pct) / 0.005));
}

/** 포스트플랍: 벳(크기 b = 팟 대비). q = 레인지 내 분위 */
export const TUNE = { vOff: 0.08, callOff: 0 };
function betL(q: number, b: number, semi: number): number {
  const vthr = clamp(0.42 + 0.38 * b + TUNE.vOff, 0.45, 0.97);
  const value = sig((q - vthr) / 0.06);
  const bluff = 0.4 * (b / (1 + b)) * sig((0.32 - q) / 0.07) + 0.05;
  const draw = semi ? 0.45 * (1 - value) : 0;
  return clamp(value + bluff + draw, 0.01, 1);
}
/** 체크: 강한 핸드는 일부 슬로우플레이 */
const checkL = (q: number, semi: number) => clamp(1 - 0.8 * betL(q, 0.5, semi), 0.06, 1);
/** 콜: MDF — 팟 대비 b 베팅에 레인지의 b/(1+b) 하위를 접는다 (상위 일부는 레이즈) */
function callL(q: number, fb: number, semi: number, river: boolean, fcb?: number): number {
  const fold = clamp((fb / (1 + fb)) * (fcb !== undefined ? clamp(fcb / 0.45, 0.6, 1.4) : 1) + TUNE.callOff, 0.08, 0.95);
  const cont = sig((q - fold) / 0.06);
  const strongRaise = 0.35 * sig((q - 0.93) / 0.03) * (river ? 0.6 : 1);
  const drawBonus = semi && q < fold ? 0.65 : 0;
  return clamp(cont * (1 - strongRaise) + drawBonus, 0.01, 1);
}
/** 베팅에 대한 레이즈: 매우 강하거나 세미블러프 */
const raiseL = (q: number, semi: number) => clamp(sig((q - 0.9) / 0.035) + (semi ? 0.12 : 0) + 0.015, 0.01, 1);
/** 우리가 벳/레이즈할 때 상대가 "계속(콜 이상)"할 확률 — 폴드 에퀴티의 근거 */
export const continueL = (q: number, fb: number, semi: number, river: boolean, fcb?: number) => Math.max(callL(q, fb, semi, river, fcb), 0.01);

// ───────────────────────── 레인지 추적 ─────────────────────────
export interface OppState { seat: number; name: string; w: Float64Array; notes: string[]; line: string[] }
const posOf = (obs: Observation, seat: number) => obs.players[seat].position;
const hintOf = (mem: OppModel | undefined, id: string): StyleHint => {
  const s = mem?.[id];
  if (!s || s.hands < 25) return { n: s?.hands ?? 0 };
  return { n: s.hands, vpip: s.vpip / s.hands, pfr: s.pfr / s.hands, af: s.aggr + s.passive ? s.aggr / (s.aggr + s.passive) : undefined, fcb: s.fcbOpp >= 8 ? s.fcb / s.fcbOpp : undefined };
};

export function boardAt(full: Card[], street: string): Card[] { return street === 'preflop' ? [] : street === 'flop' ? full.slice(0, 3) : street === 'turn' ? full.slice(0, 4) : full.slice(0, 5); }

/** 영웅 시점(=공개 정보)에서 각 상대의 레인지를 구성한다. dead = 영웅 홀카드 + 보드. */
export function buildRanges(obs: Observation, memory?: OppModel, only?: number[]): OppState[] {
  const dead = new Set<Card>([...obs.hole, ...obs.board]);
  const out: OppState[] = [];
  const nPlayers = obs.players.filter((p) => p.inHand).length;
  for (const p of obs.players) {
    if (p.isHero || !p.inHand || p.folded) continue;
    if (only && !only.includes(p.seat)) continue;
    const hint = hintOf(memory, p.id);
    const w = new Float64Array(N);
    for (let i = 0; i < N; i++) w[i] = dead.has(COMBOS[i].a) || dead.has(COMBOS[i].b) ? 0 : 1;
    const notes: string[] = []; const line: string[] = [];
    let nRaises = 0; let limpers = 0; let raiseToBB = 2.5; let curBet = obs.bb;
    let street: string = 'preflop';
    let lastBetFrac = 0; let facingFrac = 0;
    const stackBB = (p.stack + p.invested) / Math.max(1, obs.bb);
    for (const e of obs.history as HandEvent[]) {
      if (e.type === 'ante') continue;
      if (e.street !== street) { street = e.street; lastBetFrac = 0; facingFrac = 0; curBet = 0; }
      if (street === 'preflop') {
        if (e.type === 'sb' || e.type === 'bb') { if (e.type === 'bb') curBet = e.toTotal; continue; }
        const mine = e.seat === p.seat;
        if (mine && (e.type === 'raise' || e.type === 'call' || e.type === 'check' || e.type === 'bet')) {
          const type = e.type === 'bet' ? 'raise' : e.type;
          const ctx = { nRaises, pos: posOf(obs, p.seat), players: nPlayers, limpers, toCallBB: (curBet - 0) / obs.bb, raiseToBB: (type === 'raise' ? e.toTotal : curBet) / obs.bb, stackBB, allIn: e.allIn, hint, isBB: posOf(obs, p.seat) === 'BB' };
          for (let i = 0; i < N; i++) if (w[i] > 0) w[i] *= preLikelihood(COMBOS[i], type, ctx);
          line.push(`프리플랍 ${type === 'raise' ? (nRaises === 0 ? '오픈' : nRaises === 1 ? '3벳' : '4벳+') : type === 'call' ? (nRaises === 0 ? '림프' : '콜') : '체크'}`);
        }
        if (e.type === 'raise' || e.type === 'bet') { nRaises++; raiseToBB = e.toTotal / obs.bb; curBet = e.toTotal; }
        else if (e.type === 'call' && nRaises === 0) limpers++;
        continue;
      }
      // 포스트플랍
      const board = boardAt(obs.board, e.street);
      if (board.length < 3) continue;
      const info = boardInfo(board);
      const potBefore = Math.max(1, e.potBefore);
      if (e.type === 'bet' || e.type === 'raise') {
        if (e.seat === p.seat) {
          const q = quantiles(w, info);
          const b = clamp(e.type === 'bet' ? e.paid / potBefore : (e.toTotal - curBet) / potBefore + 0.5, 0.15, 2.5);
          for (let i = 0; i < N; i++) if (w[i] > 0) w[i] *= e.type === 'bet' ? betL(q[i], b, info.semi[i]) : raiseL(q[i], info.semi[i]);
          line.push(`${e.street === 'flop' ? '플랍' : e.street === 'turn' ? '턴' : '리버'} ${e.type === 'bet' ? '벳' : '레이즈'} 팟 ${Math.round(b * 100)}%`);
        }
        facingFrac = e.type === 'bet' ? e.paid / potBefore : (e.toTotal - curBet) / potBefore; curBet = e.toTotal; lastBetFrac = facingFrac;
      } else if (e.type === 'call') {
        if (e.seat === p.seat) {
          const q = quantiles(w, info);
          const fb = clamp(facingFrac > 0 ? facingFrac : e.paid / Math.max(1, potBefore - e.paid), 0.1, 3);
          for (let i = 0; i < N; i++) if (w[i] > 0) w[i] *= callL(q[i], fb, info.semi[i], e.street === 'river', hint.fcb);
          line.push(`${e.street === 'flop' ? '플랍' : e.street === 'turn' ? '턴' : '리버'} 콜 (팟 ${Math.round(fb * 100)}% 벳에)`);
        }
      } else if (e.type === 'check') {
        if (e.seat === p.seat) {
          const q = quantiles(w, info);
          for (let i = 0; i < N; i++) if (w[i] > 0) w[i] *= checkL(q[i], info.semi[i]);
          line.push(`${e.street === 'flop' ? '플랍' : e.street === 'turn' ? '턴' : '리버'} 체크`);
        }
      }
    }
    void lastBetFrac;
    // 정규화 + 요약
    let sum = 0; for (let i = 0; i < N; i++) sum += w[i];
    if (sum <= 0) for (let i = 0; i < N; i++) w[i] = dead.has(COMBOS[i].a) || dead.has(COMBOS[i].b) ? 0 : 1; // 모순된 라인이면 균등으로 되돌린다
    out.push({ seat: p.seat, name: p.name, w, notes, line });
  }
  return out;
}

/** 레인지 요약: 가중 콤보 비율과 상위 핸드 클래스 */
export function summarizeRange(w: Float64Array): { share: number; top: string[]; ess: number } {
  const byKey = new Map<string, number>(); let sum = 0, sq = 0, valid = 0;
  for (let i = 0; i < N; i++) { valid += w[i] > 0 || true ? 1 : 0; sum += w[i]; sq += w[i] * w[i]; byKey.set(COMBOS[i].key, (byKey.get(COMBOS[i].key) ?? 0) + w[i]); }
  const classMax = new Map<string, number>();
  for (let i = 0; i < N; i++) classMax.set(COMBOS[i].key, Math.max(classMax.get(COMBOS[i].key) ?? 0, w[i]));
  const top = [...byKey.entries()].map(([k, v]) => [k, v / (classMax.get(k) || 1) / (k.length === 2 ? 6 : k.endsWith('s') ? 4 : 12)] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
  void valid;
  const ess = sum * sum / Math.max(1e-12, sq); // 유효 콤보 수(Kish)
  return { share: ess / 1326, top, ess };
}

// ───────────────────────── 표본·EV ─────────────────────────
export interface Sample { win: number; combos: number[] }
function cumulative(w: Float64Array): Float64Array { const c = new Float64Array(N); let s = 0; for (let i = 0; i < N; i++) { s += w[i]; c[i] = s; } return c; }
function pick(c: Float64Array, r: number): number { let lo = 0, hi = N - 1; const t = r * c[N - 1]; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < t) lo = m + 1; else hi = m; } return lo; }

/** 상대 레인지에서 콤보를 뽑고 보드를 완성해 영웅의 승리 지분(무승부는 분할)을 기록한다 */
export function drawSamples(hole: [Card, Card], board: Card[], ranges: OppState[], sims: number, rng: RNG): Sample[] {
  const cums = ranges.map((r) => cumulative(r.w));
  const out: Sample[] = [];
  const deadBase = new Set<Card>([...hole, ...board]);
  for (let s = 0; s < sims; s++) {
    const used = new Set(deadBase); const cs: number[] = []; let ok = true;
    for (let k = 0; k < ranges.length && ok; k++) {
      let got = -1;
      for (let t = 0; t < 12; t++) { const i = pick(cums[k], rng.next()); const c = COMBOS[i]; if (ranges[k].w[i] > 0 && !used.has(c.a) && !used.has(c.b)) { got = i; break; } }
      if (got < 0) ok = false; else { cs.push(got); used.add(COMBOS[got].a); used.add(COMBOS[got].b); }
    }
    if (!ok) continue;
    const deck: Card[] = []; for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
    const need = 5 - board.length;
    for (let i = 0; i < need; i++) { const j = i + rng.int(deck.length - i); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const full = [...board, ...deck.slice(0, need)];
    const hs = evaluate([...hole, ...full]);
    let best = hs, ties = 1, beaten = false;
    for (const i of cs) { const sc = evaluate([COMBOS[i].a, COMBOS[i].b, ...full]); if (sc > best) { beaten = true; best = sc; ties = 1; } else if (sc === best && !beaten) ties++; else if (sc === best) ties++; }
    const win = hs >= best ? (hs === best ? 1 / ties : 1) : 0;
    out.push({ win: hs < best ? 0 : win, combos: cs });
  }
  return out;
}

export interface OptionEV { id: string; label: string; to?: number; ev: number; se: number; foldProb?: number; eqCont?: number; note?: string }
export interface DeepResult {
  equity: number; equitySE: number; ranges: { name: string; share: number; ess: number; top: string[]; line: string[] }[];
  options: OptionEV[]; best: OptionEV; chosen: OptionEV | null; loss: number; lossSE: number; significant: boolean; model: string;
}

function mean(a: number[]) { return a.reduce((x, y) => x + y, 0) / Math.max(1, a.length); }
function seOf(a: number[]) { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / Math.max(1, a.length - 1) / Math.max(1, a.length)); }

export interface Chosen { type: 'fold' | 'check' | 'call' | 'bet' | 'raise'; to?: number }

/** 영웅의 한 결정을 평가: 선택지별 EV(칩, 폴드 대비) */
export function evaluateDecision(obs: Observation, chosen: Chosen, rng: RNG, opts: { memory?: OppModel; sims?: number; ranges?: OppState[] } = {}): DeepResult {
  const sims = opts.sims ?? 2000;
  const ranges = opts.ranges ?? buildRanges(obs, opts.memory);
  const l = obs.legal; const P = obs.pot; const C = l.callAmount;
  const hero = obs.players[obs.seat]; const heroBet = hero.bet;
  const samples = drawSamples(obs.hole, obs.board, ranges, sims, rng);
  const n = Math.max(1, samples.length);
  const eq = samples.reduce((s, x) => s + x.win, 0) / n;
  const eqSE = Math.sqrt(Math.max(0, eq * (1 - eq)) / n);
  const info = obs.board.length >= 3 ? boardInfo(obs.board) : null;
  const quant = ranges.map((r) => (info ? quantiles(r.w, info) : null));
  const river = obs.board.length === 5;
  const hint = ranges.map((r) => hintOf(opts.memory, obs.players[r.seat].id));
  // 실현율 상수: 이후 스트리트의 효과를 단순화
  const IP = ['BTN', 'CO', 'BTN/SB'].includes(obs.position);
  const R = obs.street === 'preflop' ? (IP ? 0.95 : 0.82) - 0.05 * Math.max(0, ranges.length - 1) : river ? 1 : (IP ? 0.97 : 0.9);

  // 계속 확률(상대 i 가 팟 대비 fb 크기의 우리 벳에 계속하는 확률)을 콤보별로
  const contProb = (k: number, fb: number): Float64Array => {
    const out = new Float64Array(N);
    const w = ranges[k].w;
    if (info) { const q = quant[k]!; for (let i = 0; i < N; i++) out[i] = w[i] > 0 ? continueL(q[i], fb, info.semi[i], river, hint[k].fcb) : 0; }
    else {
      // 프리플랍: 상대가 계속할 확률 = 강도 기반 (벳이 클수록 좁아짐)
      for (let i = 0; i < N; i++) out[i] = w[i] > 0 ? sig(((0.32 / (1 + fb * 0.6)) - COMBOS[i].pct) / 0.06) * 0.95 + 0.02 : 0;
    }
    return out;
  };
  const foldProbOf = (k: number, cont: Float64Array): number => { let a = 0, b = 0; const w = ranges[k].w; for (let i = 0; i < N; i++) { a += w[i] * (1 - cont[i]); b += w[i]; } return b ? a / b : 0; };

  const options: OptionEV[] = [];
  const contrib = new Map<string, number[]>();
  const add = (o: OptionEV, arr: number[]) => { options.push(o); contrib.set(o.id, arr); };

  // 폴드
  if (l.canFold && C > 0) add({ id: 'fold', label: '폴드', ev: 0, se: 0 }, new Array(n).fill(0));
  // 체크 / 콜
  if (C > 0 && l.canCall) {
    const arr = samples.map((s) => R * s.win * (P + C) - C);
    add({ id: 'call', label: `콜 ${C.toLocaleString()}`, ev: mean(arr), se: seOf(arr) }, arr);
  } else if (l.canCheck) {
    const Rc = river ? 1 : 0.9;
    const arr = samples.map((s) => Rc * s.win * P);
    add({ id: 'check', label: '체크', ev: mean(arr), se: seOf(arr) }, arr);
  }
  // 벳/레이즈 사이즈
  if (l.canRaise) {
    const sizes: { id: string; label: string; to: number }[] = [];
    const base = obs.currentBet;
    for (const f of [0.33, 0.5, 0.75, 1, 1.5]) {
      const to = Math.round(clamp(base + f * (P + C), l.minTo, l.maxTo));
      if (!sizes.some((s) => Math.abs(s.to - to) < Math.max(1, obs.bb * 0.5))) sizes.push({ id: `r${f}`, label: `${l.isBet ? '벳' : '레이즈'} 팟 ${Math.round(f * 100)}% (${to.toLocaleString()})`, to });
    }
    if (!sizes.some((s) => s.to === l.maxTo)) sizes.push({ id: 'allin', label: `올인 (${l.maxTo.toLocaleString()})`, to: l.maxTo });
    if (chosen.to !== undefined && (chosen.type === 'bet' || chosen.type === 'raise') && !sizes.some((s) => Math.abs(s.to - chosen.to!) <= Math.max(1, obs.bb * 0.25))) sizes.push({ id: 'actual', label: `내 선택 ${l.isBet ? '벳' : '레이즈'} (${chosen.to.toLocaleString()})`, to: chosen.to });
    for (const sz of sizes) {
      const A = sz.to - heroBet;                    // 이번에 추가로 넣는 칩
      const theirCall = Math.max(0, sz.to - obs.currentBet); // 상대가 맞추려면 추가로 필요한 칩
      const fb = clamp(A / Math.max(1, P + C - 0), 0.1, 3);
      const conts = ranges.map((_, k) => contProb(k, fb));
      let fold = 1; ranges.forEach((_, k) => { fold *= foldProbOf(k, conts[k]); });
      const potCalled = P + A + theirCall * ranges.length;
      const allInRun = sz.to >= l.maxTo - 0;
      const arr: number[] = []; let wsum = 0, wwin = 0;
      for (const s of samples) {
        let wc = 1; for (let k = 0; k < ranges.length; k++) wc *= conts[k][s.combos[k]];
        wsum += wc; wwin += wc * s.win;
        arr.push(wc);
      }
      const eqCont = wsum > 0 ? wwin / wsum : 0;
      // 표본별 기여: 계속하지 않으면 +P, 계속하면 equity 몫 − A  (확률 가중은 wc 로 표현)
      const per = samples.map((s, ix) => { const wc = arr[ix]; return (1 - wc) * P + wc * ((allInRun ? 1 : R) * s.win * potCalled - A); });
      add({ id: sz.id, label: sz.label, to: sz.to, ev: mean(per), se: seOf(per), foldProb: fold, eqCont, note: `상대 계속 확률 ${(100 * (1 - fold)).toFixed(0)}% · 계속 시 승률 ${(100 * eqCont).toFixed(0)}%` }, per);
    }
  }
  // 영웅의 선택을 옵션과 대응
  let chosenOpt: OptionEV | null = null;
  if (chosen.type === 'fold') chosenOpt = options.find((o) => o.id === 'fold') ?? null;
  else if (chosen.type === 'call') chosenOpt = options.find((o) => o.id === 'call') ?? null;
  else if (chosen.type === 'check') chosenOpt = options.find((o) => o.id === 'check') ?? null;
  else if (chosen.to !== undefined) chosenOpt = options.filter((o) => o.to !== undefined).sort((a, b) => Math.abs(a.to! - chosen.to!) - Math.abs(b.to! - chosen.to!))[0] ?? null;
  const best = options.reduce((a, b) => (b.ev > a.ev ? b : a), options[0]);
  let lossSE = 0; let loss = 0;
  if (chosenOpt) {
    loss = Math.max(0, best.ev - chosenOpt.ev);
    const a = contrib.get(best.id)!, b = contrib.get(chosenOpt.id)!;
    lossSE = seOf(a.map((v, i) => v - b[i]));
  }
  const significant = loss > Math.max(2 * lossSE, 0.04 * (P + C), 0.25 * obs.bb);
  return {
    equity: eq, equitySE: eqSE,
    ranges: ranges.map((r) => { const s = summarizeRange(r.w); return { name: r.name, share: s.share, ess: s.ess, top: s.top, line: r.line }; }),
    options, best, chosen: chosenOpt, loss, lossSE, significant,
    model: '공개 행동 기반 베이지안 레인지(1,326 콤보) + 공통 난수 EV. 단일 스트리트 모델(이후 스트리트는 실현율 상수), 솔버 아님.',
  };
}

export const handLabel = (a: Card, b: Card) => `${RANK_CHARS[rankOf(a) - 2]}${cardToString(a)[1]}${RANK_CHARS[rankOf(b) - 2]}${cardToString(b)[1]}`;
