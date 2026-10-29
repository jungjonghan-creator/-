/**
 * 고급 분석실의 계산 모듈 (순수 함수). 계산과 휴리스틱을 구분해서 표기한다:
 *  - exact   : 정의가 닫혀 있는 정확한 계산 (팟오즈, n≤9 Malmuth–Harville ICM, 알려진 카드의 열거 등)
 *  - sampled : 몬테카를로 (시드·반복 수·표준오차 표시)
 *  - heuristic: 경험칙 기반 근사 (솔버 아님) — "GTO 확정값/솔버 정확도/정확한 EV 손실" 같은 표현을 쓰지 않는다.
 */
import { OPEN_BASE } from '../ai/decide';
import { PREFLOP_PCT } from '../ai/preflopTable';
import { boardWetness } from '../ai/decide';
import { Card, RANK_CHARS, rankOf, suitOf } from '../engine/cards';
import { createRng, RNG } from '../engine/rng';
import { icm } from '../game/icm';

export type Rigor = 'exact' | 'sampled' | 'heuristic';
export const RIGOR_LABEL: Record<Rigor, string> = { exact: '정확한 계산', sampled: '몬테카를로 추정', heuristic: '휴리스틱(솔버 아님)' };

// ───────────────────────── 프리플랍 연구소 ─────────────────────────
export type PfAction = 'fold' | 'call' | 'raise' | 'jam';
export interface PfCell { key: string; pct: number; action: PfAction }
export interface PfOptions {
  scenario: 'rfi' | 'bbDefend' | 'vs3bet' | 'pushfold';
  /** 포지션 라벨 (OPEN_BASE 키와 동일): UTG … BTN, SB, BB */
  pos: string;
  seats: number;
  stackBB: number;
  ante: boolean;
}
export const PF_STACKS = [10, 15, 20, 30, 40, 60, 100];
export const POS_BY_SEATS: Record<number, string[]> = {
  2: ['BTN/SB', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['CO', 'BTN', 'SB', 'BB'], 5: ['HJ', 'CO', 'BTN', 'SB', 'BB'], 6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  7: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'], 8: ['UTG', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'], 9: ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

/** 13×13 격자의 핸드 클래스 키: 대각선 = 페어, 위 = 수티드, 아래 = 오프수트 */
export function gridKeys(): string[][] {
  const R = [...RANK_CHARS].reverse();
  return R.map((a, i) => R.map((b, j) => (i === j ? a + b : i < j ? a + b + 's' : b + a + 'o')));
}
export const combosOf = (key: string): number => (key.length === 2 ? 6 : key.endsWith('s') ? 4 : 12);

const tableScale = (seats: number) => (seats <= 2 ? 1.5 : seats <= 3 ? 1.35 : seats <= 6 ? 1.15 : 1);
function openPct(o: PfOptions): number {
  let p = (OPEN_BASE[o.pos] ?? 0.2) * tableScale(o.seats);
  if (o.ante) p *= 1.1;
  if (o.stackBB >= 60) p *= 1; else if (o.stackBB >= 30) p *= 0.95; else if (o.stackBB >= 20) p *= 0.85;
  return Math.max(0.03, Math.min(0.9, p));
}
/** 푸시 폴드 근사: 스택이 짧을수록, 뒤에 남은 사람이 적을수록 넓다 (Nash 해가 아니라 경험적 근사) */
function jamPct(o: PfOptions, behind: number): number {
  const base = 0.1 + (15 - Math.min(15, o.stackBB)) * 0.045 + (o.ante ? 0.05 : 0);
  const posBoost = 0.34 * (1 - Math.min(behind, 8) / 9);
  return Math.max(0.06, Math.min(0.9, base + posBoost));
}
const BLUFF_3BET = new Set(['A5s', 'A4s', 'A3s', 'A2s', 'K9s', 'KJo', 'QJs', 'J9s', 'T9s', '76s', '65s']);

export function preflopGrid(o: PfOptions): { cells: PfCell[][]; summary: { raise: number; call: number; jam: number; total: number }; rigor: Rigor; note: string } {
  const keys = gridKeys();
  const posList = POS_BY_SEATS[o.seats] ?? POS_BY_SEATS[9];
  const behind = posList.length - 1 - Math.max(0, posList.indexOf(o.pos));
  const open = openPct(o);
  const jam = jamPct(o, behind);
  const cells = keys.map((row) => row.map((key): PfCell => {
    const pct = PREFLOP_PCT[key] ?? 1;
    let action: PfAction = 'fold';
    if (o.scenario === 'pushfold' || o.stackBB <= 12 && o.scenario === 'rfi') action = pct <= jam ? 'jam' : 'fold';
    else if (o.scenario === 'rfi') action = pct <= open ? (o.stackBB <= 20 && pct <= open * 0.35 && o.stackBB < 25 ? 'jam' : 'raise') : 'fold';
    else if (o.scenario === 'bbDefend') {
      const cont = Math.min(0.75, 0.42 + (o.stackBB >= 30 ? 0.12 : 0) + (OPEN_BASE[o.pos] ?? 0.2) * 0.3); // o.pos = 상대 오픈 포지션
      const threeBet = pct <= 0.045 || (BLUFF_3BET.has(key) && pct <= 0.45);
      action = threeBet ? (o.stackBB <= 25 && pct <= 0.04 ? 'jam' : 'raise') : pct <= cont ? 'call' : 'fold';
    } else if (o.scenario === 'vs3bet') {
      const fourBet = pct <= 0.02 || (key === 'A5s' || key === 'A4s');
      const call = pct <= 0.085 * (0.8 + Math.min(o.stackBB, 100) / 200);
      action = fourBet ? (o.stackBB <= 35 ? 'jam' : 'raise') : call ? 'call' : 'fold';
    }
    return { key, pct, action };
  }));
  let tot = 0; const agg = { raise: 0, call: 0, jam: 0, total: 0 };
  for (const row of cells) for (const c of row) { const w = combosOf(c.key); tot += w; if (c.action === 'raise') agg.raise += w; else if (c.action === 'call') agg.call += w; else if (c.action === 'jam') agg.jam += w; }
  agg.raise /= tot; agg.call /= tot; agg.jam /= tot; agg.total = agg.raise + agg.call + agg.jam;
  return { cells, summary: agg, rigor: 'heuristic', note: '기초 권장 레인지(휴리스틱)입니다. 솔버 결과가 아니며 상대·ICM·바운티에 따라 달라집니다. 핸드 강도 순서는 169핸드 클래스의 몬테카를로 승률 표를 씁니다.' };
}

// ───────────────────────── 포스트플랍 연구소 ─────────────────────────
export interface Texture {
  label: string; wetness: number; suits: 'monotone' | 'two-tone' | 'rainbow'; paired: boolean; highRank: string; connected: string; drawsPossible: boolean;
  rangeAdvantage: 'raiser' | 'caller' | 'neutral'; cbet: { sizeFrac: number; freq: number; why: string };
  sprAdvice: string; rigor: Rigor;
}
export function analyzeBoard(board: Card[], spr: number): Texture {
  const flop = board.slice(0, 3);
  const w = boardWetness(flop);
  const sc = [0, 0, 0, 0]; flop.forEach((c) => sc[suitOf(c)]++);
  const mx = Math.max(...sc);
  const suits = mx === 3 ? 'monotone' : mx === 2 ? 'two-tone' : 'rainbow';
  const rs = flop.map(rankOf).sort((a, b) => b - a);
  const paired = new Set(rs).size < 3;
  const hi = rs[0];
  const gaps = [rs[0] - rs[1], rs[1] - rs[2]];
  const connected = gaps.every((g) => g <= 2) ? '연결됨(스트레이트 가능성 큼)' : gaps.some((g) => g <= 2) ? '부분 연결' : '단절';
  const label = w < 0.25 ? '드라이' : w < 0.55 ? '세미 웻' : '웻';
  // 레이저(오픈 레이즈 어그레서) 레인지는 높은 카드·페어에 유리, 콜러는 낮고 연결된 보드에 유리하다는 경험칙
  const adv: Texture['rangeAdvantage'] = hi >= 13 && w < 0.5 ? 'raiser' : hi <= 9 && w >= 0.4 ? 'caller' : 'neutral';
  const sizeFrac = w < 0.25 ? 0.33 : w < 0.55 ? 0.5 : 0.75;
  const freq = adv === 'raiser' ? (w < 0.25 ? 0.75 : 0.55) : adv === 'caller' ? 0.3 : 0.45;
  const why = `${label} 보드(웻니스 ${w.toFixed(2)}) · ${adv === 'raiser' ? '어그레서 레인지 우위' : adv === 'caller' ? '콜러 레인지 우위' : '레인지 중립'} → 작은/중간 사이즈로 ${Math.round(freq * 100)}% 안팎 C-벳`;
  const sprAdvice = spr < 3 ? 'SPR 3 미만: 탑페어+ 면 스택을 넣는 것이 자연스럽습니다. 팟 컨트롤 여지가 적습니다.' : spr < 8 ? 'SPR 3~8: 강한 핸드는 2~3개 스트리트에 걸쳐 가치를 만들고, 드로우는 세미블러프 후보입니다.' : 'SPR 8 초과: 원페어만으로 스택을 거는 것은 위험합니다. 팟 컨트롤과 포지션이 중요합니다.';
  return { label, wetness: w, suits, paired, highRank: RANK_CHARS[hi - 2], connected, drawsPossible: w >= 0.4, rangeAdvantage: adv, cbet: { sizeFrac, freq, why }, sprAdvice, rigor: 'heuristic' };
}

// ───────────────────────── ICM 연구소 ─────────────────────────
export interface IcmResult { mode: 'exact' | 'sampled'; equity: number[]; pct: number[]; se?: number[]; samples?: number; note: string }
/** n≤9: Malmuth–Harville 정확 계산. n>9: 같은 모델을 순차 추첨으로 몬테카를로(표준오차 표시). 모델 자체가 근사(실제 플레이 스킬·바운티 미반영)임은 별도. */
export function icmLab(stacks: number[], payouts: number[], seed = 7, samples = 20000): IcmResult {
  const n = stacks.length;
  const pool = payouts.reduce((a, b) => a + b, 0);
  if (n <= 9) {
    const eq = icm(stacks, payouts);
    return { mode: 'exact', equity: eq, pct: eq.map((e) => (pool ? e / pool : 0)), note: 'Malmuth–Harville 모델의 정확한 계산(n≤9). 모델 가정: 순위 확률이 칩 비율에 비례. 스킬 차이·포지션·바운티는 반영하지 않습니다.' };
  }
  const rng = createRng(seed);
  const acc = new Array(n).fill(0), acc2 = new Array(n).fill(0);
  const pays = [...payouts, ...new Array(Math.max(0, n - payouts.length)).fill(0)];
  for (let s = 0; s < samples; s++) {
    const rem = stacks.map((v, i) => ({ v, i }));
    let total = stacks.reduce((a, b) => a + b, 0);
    const got = new Array(n).fill(0);
    for (let place = 0; place < Math.min(payouts.length, n) && rem.length; place++) {
      let r = rng.next() * total, k = 0;
      for (; k < rem.length - 1; k++) { r -= rem[k].v; if (r <= 0) break; }
      const pick = rem.splice(k, 1)[0]; total -= pick.v; got[pick.i] = pays[place];
    }
    for (let i = 0; i < n; i++) { acc[i] += got[i]; acc2[i] += got[i] * got[i]; }
  }
  const eq = acc.map((a) => a / samples);
  const se = acc2.map((a2, i) => Math.sqrt(Math.max(0, a2 / samples - eq[i] * eq[i]) / samples));
  return { mode: 'sampled', equity: eq, pct: eq.map((e) => (pool ? e / pool : 0)), se, samples, note: `Malmuth–Harville 모델을 ${samples.toLocaleString()}회 순차 추첨한 몬테카를로 추정입니다 (시드 ${seed}, 표준오차 표시). 모델 자체가 근사입니다.` };
}

export interface BubbleResult { evFold: number; evWin: number; evLose: number; breakevenEquity: number; chipBreakeven: number; riskPremium: number; bubbleFactor: number; effective: number; mode: IcmResult['mode'] }
/** 올인 대결의 ICM 손익분기 승률. 승/패/폴드 각각의 ICM 가치를 비교한다(팟 크기 = 상대와의 맞대결 칩 effective 만큼). */
export function bubbleFactor(stacks: number[], payouts: number[], hero: number, villain: number, opts: { callCost?: number; potBefore?: number } = {}): BubbleResult {
  const E = Math.min(stacks[hero], stacks[villain]);
  const fold = icmLab(stacks, payouts);
  const win = stacks.map((s, i) => (i === hero ? s + E : i === villain ? s - E : s));
  const lose = stacks.map((s, i) => (i === hero ? s - E : i === villain ? s + E : s));
  const w = icmLab(win, payouts).equity[hero], l = icmLab(lose, payouts).equity[hero], f = fold.equity[hero];
  const be = (f - l) / Math.max(1e-9, w - l);
  const call = opts.callCost ?? E, pot = opts.potBefore ?? E;
  const chipBe = call / Math.max(1, pot + call);
  const bf = (f - l) / Math.max(1e-9, w - f);
  return { evFold: f, evWin: w, evLose: l, breakevenEquity: be, chipBreakeven: chipBe, riskPremium: be - chipBe, bubbleFactor: bf, effective: E, mode: fold.mode };
}

// ───────────────────────── 맞춤 훈련용 문제 생성 ─────────────────────────
export interface TrainQuestion { id: string; leak: string; source: 'real-spot' | 'generated'; title: string; hole: [Card, Card]; board: Card[]; pot: number; toCall: number; stackBB: number; pos: string; villainPct: number; oppAction: string }
export function makeSpotQuestion(rng: RNG, leak: string, index: number): TrainQuestion {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) { const j = rng.int(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const hole: [Card, Card] = [deck[0], deck[1]];
  const street = leak === 'river-call' ? 5 : leak === 'turn-call' ? 4 : 3;
  const board = deck.slice(2, 2 + street);
  const fracs = leak === 'overbet-fold' ? [0.9, 1.2, 1.5] : leak === 'small-bet-fold' ? [0.25, 0.33, 0.4] : [0.33, 0.5, 0.75, 1];
  const frac = fracs[rng.int(fracs.length)];
  const pot = 100 * (4 + rng.int(8));
  const toCall = Math.round(pot * frac);
  return {
    id: `${leak}:${index}`, leak, source: 'generated', title: `${street === 3 ? '플랍' : street === 4 ? '턴' : '리버'} · 상대가 팟의 ${Math.round(frac * 100)}% 베팅`, hole, board, pot, toCall,
    stackBB: 40 + rng.int(60), pos: ['BTN', 'CO', 'BB', 'SB', 'HJ'][rng.int(5)], villainPct: [0.12, 0.2, 0.3][rng.int(3)], oppAction: `벳 ${toCall}`,
  };
}

/** 훈련 문서화: 사전 점수 → 교정 → 사후 점수(독립 문제) → 7일 후 복습. 실력 향상 선언의 최소 표본/기준을 사전에 고정한다. */
export const TRAINING_RULES = { questionsPerSet: 15, minSamplePerSet: 15, improvementThreshold: 0.15, reviewAfterDays: 7, minInGameDecisions: 30 };
export interface TrainingAttempt { id: string; leak: string; at: number; pre: number | null; post: number | null; n: number; reviewDue: number; handsAtTraining: number }
export function verdictOfTraining(a: TrainingAttempt): string {
  if (a.pre === null || a.post === null) return '진행 중';
  if (a.n < TRAINING_RULES.minSamplePerSet) return '표본 부족 — 판정 보류';
  const d = a.post - a.pre;
  return d >= TRAINING_RULES.improvementThreshold ? `문제 정답률 +${Math.round(d * 100)}%p (기준 +${TRAINING_RULES.improvementThreshold * 100}%p 달성). 단, 실력 향상은 실전 변화로 다시 확인합니다` : d <= -0.1 ? `정답률 ${Math.round(d * 100)}%p 하락 — 표본 변동 가능성, 다시 시도하세요` : '뚜렷한 변화 없음 (기준 미달)';
}
