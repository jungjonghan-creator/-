import { estimateEquity, holePct } from '../ai/equity';
import { handKey } from '../ai/handKey';
import { Card, newDeck, parseCards, hasDuplicates } from '../engine/cards';
import { RNG } from '../engine/rng';

// ───── 푸시/폴드 (근사 모델 — 내시 균형/솔버 데이터가 아님) ─────
export interface PushFoldSpot { hole: [Card, Card]; pos: string; bbs: number; ante: number; behind: number; blindPosted: number }
export interface PushFoldAnswer { push: boolean; evPush: number; evFold: number; callPct: number; foldProb: number; equityVsCall: number; approx: true }

export const PF_POSITIONS: { pos: string; behind: number; posted: number }[] = [
  { pos: 'UTG', behind: 5, posted: 0 }, { pos: 'CO', behind: 3, posted: 0 }, { pos: 'BTN', behind: 2, posted: 0 }, { pos: 'SB', behind: 1, posted: 0.5 },
];

export function generatePushFold(rng: RNG): PushFoldSpot {
  const deck = newDeck();
  const a = deck.splice(rng.int(52), 1)[0], b = deck.splice(rng.int(51), 1)[0];
  const p = PF_POSITIONS[rng.int(PF_POSITIONS.length)];
  return { hole: [a, b], pos: p.pos, bbs: 3 + rng.int(13), ante: rng.int(2) ? 0.125 : 0, behind: p.behind, blindPosted: p.posted };
}

/** 단순 EV 모델: 뒤의 각 플레이어가 상위 callPct 로 콜한다고 가정. 단위=BB */
export function solvePushFold(s: PushFoldSpot, rng: RNG, sims = 2500): PushFoldAnswer {
  const S = s.bbs;
  const baseCall = Math.min(0.75, 2.4 * Math.pow(S, -0.9));
  const callPct = s.behind === 1 ? baseCall : baseCall * 0.8;
  const foldProb = Math.pow(1 - callPct, s.behind);
  const nPlayers = s.behind + 1;
  const dead = 1.5 + s.ante * 6 - s.blindPosted; // 현재 팟에서 내 몫 제외한 데드머니(근사)
  const eq = estimateEquity(s.hole, [], [{ pct: callPct, boardTop: 1 }], sims, rng);
  // 콜 받으면: 승률 eq 로 (2S + dead_others) 팟
  const potIfCalled = 2 * S + 1.5 - s.blindPosted + s.ante * (nPlayers + 1);
  const evCalled = eq * potIfCalled - S;
  const evPush = foldProb * (1.5 + s.ante * (nPlayers + 1) - s.blindPosted) + (1 - foldProb) * evCalled - s.ante * 0;
  const evFold = -s.blindPosted;
  void dead;
  return { push: evPush > evFold, evPush, evFold, callPct, foldProb, equityVsCall: eq, approx: true };
}

// ───── 상황별 스팟 훈련 ─────
export interface Spot {
  id: string; hole: string; board: string; pos: string; opponents: number; stackBB: number; potBB: number; toCallBB: number; villainPct: number; note?: string;
}
export function validateSpot(s: Spot): string[] {
  const errs: string[] = [];
  let cards: Card[] = [];
  try { cards = [...parseCards(s.hole), ...parseCards(s.board)]; } catch (e) { return ['카드 형식 오류: ' + (e as Error).message]; }
  const hole = parseCards(s.hole);
  const board = s.board.trim() ? parseCards(s.board) : [];
  if (hole.length !== 2) errs.push('홀카드는 정확히 2장');
  if (![0, 3, 4, 5].includes(board.length)) errs.push('보드는 0/3/4/5장');
  if (hasDuplicates(cards)) errs.push('중복 카드');
  if (s.opponents < 1 || s.opponents > 8) errs.push('상대 수는 1~8');
  if (s.stackBB <= 0 || s.potBB <= 0 || s.toCallBB < 0) errs.push('스택/팟/콜 금액이 올바르지 않음');
  if (s.toCallBB > s.stackBB) errs.push('콜 금액이 스택보다 큼');
  if (s.villainPct <= 0 || s.villainPct > 1) errs.push('상대 레인지는 0~100%');
  return errs;
}
export interface SpotResult { equity: number; se: number; need: number | null; evCallBB: number | null; advice: string; handKey: string; handPct: number; approx: true }
export function solveSpot(s: Spot, rng: RNG, sims = 6000): SpotResult {
  const hole = parseCards(s.hole) as [Card, Card];
  const board = s.board.trim() ? parseCards(s.board) : [];
  const eq = estimateEquity(hole, board, Array.from({ length: s.opponents }, () => ({ pct: s.villainPct, boardTop: 1 })), sims, rng);
  const se = Math.sqrt(eq * (1 - eq) / sims);
  const need = s.toCallBB > 0 ? s.toCallBB / (s.potBB + s.toCallBB) : null;
  const evCall = need !== null ? eq * (s.potBB + s.toCallBB) - s.toCallBB : null;
  let advice: string;
  if (need !== null) advice = eq > need + 2 * se ? '콜 이상 (승률이 팟오즈를 상회)' : eq < need - 2 * se ? '폴드 (승률이 팟오즈에 미달)' : '경계선 — 임플라이드 오즈/포지션에 따라 달라짐';
  else advice = eq > 0.6 ? '밸류 벳 고려' : eq < 0.3 ? '체크/폴드 또는 블러프 고려(폴드 확률 필요)' : '체크 또는 작은 벳(보호/얇은 밸류)';
  return { equity: eq, se, need, evCallBB: evCall, advice, handKey: handKey(hole[0], hole[1]), handPct: holePct(hole[0], hole[1]), approx: true };
}
