import { inferRange } from '../ai/decide';
import { estimateEquity, holePct } from '../ai/equity';
import { observe } from '../ai/observation';
import { handKey } from '../ai/handKey';
import { cardToString } from '../engine/cards';
import { describe } from '../engine/evaluator';
import { replayRecord } from '../engine/replay';
import { createRng } from '../engine/rng';
import { evaluate } from '../engine/evaluator';
import { HandRecord } from '../engine/types';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export interface DecisionReview {
  actionIndex: number;
  street: string;
  actionLabel: string;
  pot: number;
  toCall: number;
  /** 모든 수치는 "추정"이다. 솔버 결과가 아니다. */
  equity: number;          // 몬테카를로 추정 승률 (상대 레인지 추론 가정)
  equitySE: number;        // 표본 표준오차
  rangeUncertainty: number; // 레인지 가정 불확실성(경험적 상수)
  potOddsNeed: number | null; // 정확한 팟오즈 (콜 필요 에퀴티)
  evCall: number | null;   // 모델 기반 콜 EV 추정 (칩)
  score: number | null;    // 0~100 (근사 평가). null = 평가 불가(블러프 등)
  grade: Grade | null;
  mistake: string | null;
  notes: string[];
  alternatives: string[];
  lesson: string;
  borderline: boolean;
}

export interface HandReview {
  recordNo: number;
  heroNet: number;
  summary: string[];
  decisions: DecisionReview[];
  /** 결과와 판단 품질은 별개 */
  resultVsQuality: string;
  approxNotice: string;
}

const gradeOf = (s: number): Grade => (s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 68 ? 'C' : s >= 52 ? 'D' : 'F');
export const APPROX_NOTICE = '승률은 몬테카를로 추정(상대 레인지는 공개 행동으로부터의 휴리스틱 추론)이며 솔버 결과가 아닙니다. 점수는 근사 평가입니다.';

export function reviewHand(rec: HandRecord, heroId = 'hero', sims = 1200): HandReview {
  const heroSeat = rec.startStacks.find((s) => s.id === heroId)!.seat;
  const decisions: DecisionReview[] = [];
  const res = rec.result!;
  const heroNet = res.net[heroSeat] ?? 0;
  const rng = createRng(rec.seed ^ 0x9e3779b1);
  rec.actions.forEach((a, idx) => {
    if (a.seat !== heroSeat) return;
    const before = replayRecord(rec, idx);
    const after = replayRecord(rec, idx + 1);
    const obs = observe(before, heroSeat);
    const l = obs.legal;
    // 프리플랍: 아직 행동하지 않은 플레이어는 폴드한다고 가정 (이미 콜/레이즈한 상대만 비교)
    const actedSeats = new Set(obs.history.filter((e) => e.street === 'preflop' && (e.type === 'call' || e.type === 'raise' || e.type === 'bet')).map((e) => e.seat));
    let opp = obs.players.filter((p) => !p.isHero && p.inHand && !p.folded);
    if (obs.street === 'preflop') { const f = opp.filter((p) => actedSeats.has(p.seat)); opp = f.length ? f : opp.filter((p) => p.position === 'BB' || p.position === 'BTN/SB').slice(0, 1); }
    const ranges = opp.map((o) => inferRange(obs, o));
    const equity = estimateEquity(obs.hole, obs.board, ranges, sims, rng);
    const se = Math.sqrt(equity * (1 - equity) / sims);
    const unc = obs.street === 'preflop' ? 0.06 : 0.05;
    const ev = after.events[after.events.length - 1];
    const type = ev.type;
    const toCall = l.callAmount;
    const pot = obs.pot;
    const need = toCall > 0 ? toCall / (pot + toCall) : null;
    const evCall = need !== null ? equity * (pot + toCall) - toCall : null;
    const notes: string[] = [];
    const alternatives: string[] = [];
    let score: number | null = null; let mistake: string | null = null; let lesson = '';
    const margin = Math.max(unc, se * 2);
    let borderline = false;
    const label = type === 'fold' ? '폴드' : type === 'check' ? '체크' : type === 'call' ? `콜 ${ev.paid.toLocaleString()}` : `${type === 'bet' ? '베팅' : '레이즈'} → ${ev.toTotal.toLocaleString()}`;
    const key = handKey(obs.hole[0], obs.hole[1]);
    notes.push(`핸드 ${obs.hole.map(cardToString).join(' ')} (${key}, 프리플랍 상위 ${(holePct(obs.hole[0], obs.hole[1]) * 100).toFixed(0)}%) · 포지션 ${obs.position}`);
    if (obs.board.length >= 3) notes.push(`보드 ${obs.board.map(cardToString).join(' ')} · 현재 메이드핸드: ${describe(evaluate([...obs.hole, ...obs.board]))}`);
    if (obs.street === 'preflop') notes.push('프리플랍 가정: 아직 행동하지 않은 플레이어는 폴드(이미 콜/레이즈한 상대와의 에퀴티)');
    ranges.forEach((r, i) => notes.push(`상대 추정 레인지(${opp[i].name}): 프리플랍 상위 ${(r.pct * 100).toFixed(0)}%${r.boardTop < 1 ? ` · 현재 보드 강도 상위 ${(r.boardTop * 100).toFixed(0)}%` : ''} (휴리스틱 추론)`));
    notes.push(`추정 승률 ${(equity * 100).toFixed(1)}% (±${(se * 200).toFixed(1)}%p 표본오차, 레인지 가정 불확실성 ±${(unc * 100).toFixed(0)}%p) vs ${opp.length}명`);
    if (need !== null) notes.push(`정확한 팟오즈: 콜 ${toCall.toLocaleString()} / 팟 ${(pot + toCall).toLocaleString()} → 필요 승률 ${(need * 100).toFixed(1)}%`);

    if (need !== null && (type === 'fold' || type === 'call')) {
      const evFold = 0;
      const chosen = type === 'call' ? evCall! : evFold;
      const best = Math.max(evCall!, evFold);
      const loss = best - chosen;
      const scale = pot + toCall;
      score = Math.round(100 * (1 - Math.min(1, (loss / scale) * 3.5)));
      if (Math.abs(equity - need) < margin) { borderline = true; score = Math.max(score, 78); notes.push('승률과 필요 승률이 오차 범위 안 — 경계선 판단(어느 쪽도 큰 실수 아님)'); }
      else if (type === 'fold' && equity > need + margin) { mistake = '과폴드(추정)'; lesson = '팟오즈가 충분했습니다. 추정 승률이 필요 승률보다 높을 때는 콜을 고려하세요.'; }
      else if (type === 'call' && equity < need - margin) { mistake = '과콜(추정)'; lesson = '팟오즈에 못 미치는 승률입니다. 이런 상황은 폴드가 기본입니다(드로우의 임플라이드 오즈 제외).'; }
      else lesson = '팟오즈와 승률이 부합하는 판단입니다.';
      alternatives.push(type === 'call' ? `폴드 (EV ≈ 0)` : `콜 (모델 EV ≈ ${evCall!.toFixed(0)} 칩)`);
      notes.push(`모델 기반 EV: 콜 ≈ ${evCall!.toFixed(0)} 칩, 폴드 = 0 (승률 실현 100% 가정의 단순 모델)`);
    } else if (type === 'check') {
      if (equity > 0.72 + unc && l.canRaise && obs.street !== 'river') { mistake = '밸류 기회 놓침(추정)'; score = 62; lesson = '강한 핸드로 체크했습니다. 상대가 이후 벳을 하도록 유도하는 의도가 아니라면 밸류 벳을 고려하세요.'; alternatives.push('팟 ½~¾ 밸류 벳'); }
      else { score = 85; lesson = '무난한 체크입니다.'; }
    } else if (type === 'bet' || type === 'raise') {
      const sizeFrac = ev.paid / Math.max(1, pot);
      if (equity >= 0.55) { score = 88; lesson = '밸류 벳/레이즈로 적절한 수준의 승률입니다.'; notes.push(`밸류 벳 (팟 대비 ${(sizeFrac * 100).toFixed(0)}%)`); }
      else if (equity >= 0.3 && obs.street !== 'river') { score = 76; lesson = '세미블러프 영역입니다. 상대 폴드 확률에 따라 EV가 결정되며 폴드 확률은 추정 불가입니다.'; notes.push('세미블러프: 폴드 에퀴티 의존 — 점수는 중립 근사'); }
      else { score = null; lesson = '블러프입니다. 성공 여부는 상대의 폴드 빈도에 달려 있어 정량 평가하지 않습니다.'; notes.push('순수 블러프: 평가 불가(폴드 확률 모델 없음)'); }
      if (equity < 0.4 && sizeFrac > 1.1) { mistake = '과대 베팅(추정)'; score = score === null ? null : Math.min(score, 55); }
      alternatives.push('체크 또는 더 작은 사이즈');
    }
    if (type === 'raise' && equity < 0.5 && toCall > 0 && !mistake) alternatives.push(`콜 (모델 EV ≈ ${evCall!.toFixed(0)} 칩)`);
    decisions.push({
      actionIndex: idx, street: obs.street, actionLabel: label, pot, toCall, equity, equitySE: se, rangeUncertainty: unc,
      potOddsNeed: need, evCall, score, grade: score === null ? null : gradeOf(score), mistake, notes, alternatives,
      lesson: lesson || '평가 정보가 부족합니다.', borderline,
    });
  });

  const summary: string[] = [];
  const potTotal = res.pots.reduce((t, p) => t + p.amount, 0);
  summary.push(res.endedByFold ? `상대가 폴드하여 종료 · 팟 ${potTotal.toLocaleString()}` : `쇼다운 · 팟 ${potTotal.toLocaleString()}`);
  summary.push(`내 손익 ${heroNet >= 0 ? '+' : ''}${heroNet.toLocaleString()} 칩`);
  res.pots.forEach((p, i) => summary.push(`${i === 0 ? '메인팟' : '사이드팟' + i} ${p.amount.toLocaleString()} → ${p.winners.map((w) => rec.startStacks[w].name + (p.winners.length > 1 ? `(${p.share[w]})` : '')).join(', ')}`));
  const graded = decisions.filter((d) => d.score !== null);
  const avg = graded.length ? graded.reduce((t, d) => t + d.score!, 0) / graded.length : null;
  const bad = decisions.some((d) => d.mistake);
  const resultVsQuality = avg === null ? '평가 가능한 결정이 없습니다.'
    : heroNet > 0 && bad ? '이겼지만 판단에 개선점이 있습니다 — 결과(운)와 의사결정 품질은 별개입니다.'
    : heroNet < 0 && !bad ? '졌지만 추정상 합리적인 판단이었습니다 — 단기 결과에 흔들리지 마세요.'
    : heroNet > 0 ? '결과와 판단 모두 양호합니다.' : '결과와 판단 모두 개선 여지가 있습니다.';
  return { recordNo: rec.handNo, heroNet, summary, decisions, resultVsQuality, approxNotice: APPROX_NOTICE };
}
