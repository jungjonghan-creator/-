import { inferRange, OPEN_BASE } from '../ai/decide';
import { buildRanges, evaluateDecision, DeepResult } from './deep';
import type { OppModel } from '../ai/opponentModel';
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
  // ── 집계용 필드 ──
  position: string;
  actionType: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  handKey: string;
  opponents: number;
  /** 추정 EV 손실 (BB 단위, 신뢰구간 밖의 콜/폴드 실수만 집계. 그 외 0) */
  evLossBB: number;
  facingBet: boolean;
  betFracOfPot: number | null;   // 내가 벳/레이즈했다면 팟 대비 크기
  facedFracOfPot: number | null; // 내가 직면한 벳의 팟 대비 크기
  stackBB: number;
  preflopRaisesFaced: number;
  /** 심층 추론(베이지안 레인지 + 선택지별 EV) 결과. 프리플랍 첫 오픈은 범위표 평가라 없음 */
  deep?: { options: { label: string; ev: number; se: number; foldProb?: number; chosen: boolean; best: boolean }[]; ranges: { name: string; line: string[]; top: string[]; share: number }[]; lossBB: number; lossSEBB: number; significant: boolean; model: string };
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
export const APPROX_NOTICE = '승률·EV는 몬테카를로 추정입니다. 상대 레인지는 공개된 행동 순서(프리플랍~현재 스트리트, 베팅 크기 포함)에서 베이지안으로 추적한 것이며 솔버 결과가 아닙니다. 점수는 근사 평가입니다.';

export function reviewHand(rec: HandRecord, heroId = 'hero', sims = 1200, memory?: OppModel): HandReview {
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
    const raisesFaced0 = obs.history.filter((e) => e.street === 'preflop' && (e.type === 'raise' || e.type === 'bet')).length;
    const unopened0 = obs.street === 'preflop' && raisesFaced0 === 0 && obs.position !== 'BB';
    const ev = after.events[after.events.length - 1];
    let deep: DeepResult | null = null;
    let equity: number; let se: number;
    const ranges = unopened0 ? opp.map((o) => inferRange(obs, o)) : [];
    if (unopened0) {
      equity = estimateEquity(obs.hole, obs.board, ranges, sims, rng);
      se = Math.sqrt(equity * (1 - equity) / sims);
    } else {
      deep = evaluateDecision(obs, { type: ev.type as 'fold' | 'check' | 'call' | 'bet' | 'raise', to: ev.toTotal }, rng, { memory, sims: Math.max(500, Math.round(sims * 1.2)), ranges: buildRanges(obs, memory, opp.map((o) => o.seat)) });
      equity = deep.equity; se = deep.equitySE;
    }
    const unc = deep ? 0.035 : obs.street === 'preflop' ? 0.06 : 0.05;
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
    const raisesFaced = obs.history.filter((e) => e.street === 'preflop' && (e.type === 'raise' || e.type === 'bet')).length;
    notes.push(`핸드 ${obs.hole.map(cardToString).join(' ')} (${key}, 프리플랍 상위 ${(holePct(obs.hole[0], obs.hole[1]) * 100).toFixed(0)}%) · 포지션 ${obs.position}`);
    if (obs.board.length >= 3) notes.push(`보드 ${obs.board.map(cardToString).join(' ')} · 현재 메이드핸드: ${describe(evaluate([...obs.hole, ...obs.board]))}`);
    if (obs.street === 'preflop') notes.push('프리플랍 가정: 아직 행동하지 않은 플레이어는 폴드(이미 콜/레이즈한 상대와의 에퀴티)');
    if (deep) deep.ranges.forEach((r) => notes.push(`상대 레인지(${r.name}): ${r.line.length ? r.line.join(' → ') : '행동 정보 없음'} ⇒ 유효 ${(r.share * 100).toFixed(0)}% 콤보 · 주요 ${r.top.slice(0, 5).join(' ')}`));
    else ranges.forEach((r, i) => notes.push(`상대 추정 레인지(${opp[i].name}): 프리플랍 상위 ${(r.pct * 100).toFixed(0)}%${r.boardTop < 1 ? ` · 현재 보드 강도 상위 ${(r.boardTop * 100).toFixed(0)}%` : ''} (휴리스틱 추론)`));
    notes.push(`추정 승률 ${(equity * 100).toFixed(1)}% (±${(se * 200).toFixed(1)}%p 표본오차, 레인지 가정 불확실성 ±${(unc * 100).toFixed(0)}%p) vs ${opp.length}명`);
    if (need !== null) notes.push(`정확한 팟오즈: 콜 ${toCall.toLocaleString()} / 팟 ${(pot + toCall).toLocaleString()} → 필요 승률 ${(need * 100).toFixed(1)}%`);

    const handPct = holePct(obs.hole[0], obs.hole[1]);
    const unopened = obs.street === 'preflop' && raisesFaced === 0 && obs.position !== 'BB';
    if (unopened) {
      // 앞에 레이즈가 없는 프리플랍: 팟오즈가 아니라 포지션별 오픈 범위로 평가 (근사 기준: AI 와 동일한 범위표)
      const thr = Math.min(0.95, (OPEN_BASE[obs.position] ?? 0.2) * (obs.players.filter((p) => p.inHand).length >= 8 ? 0.85 : 1));
      const hu = obs.position === 'BTN/SB';
      notes.push(`포지션 ${obs.position}의 기준 오픈 범위는 상위 약 ${(thr * 100).toFixed(0)}% (근사 기준, 솔버 아님) — 내 핸드는 상위 ${(handPct * 100).toFixed(0)}%`);
      if (type === 'raise') {
        if (handPct <= thr * 1.25) { score = 92; lesson = '범위 안의 적절한 오픈입니다.'; }
        else if (handPct <= thr * 1.7) { score = 74; lesson = '범위보다 약간 넓은 오픈입니다. 포지션이 좋거나 상대가 약하면 허용됩니다.'; }
        else { score = 45; mistake = '범위 밖 오픈(추정)'; lesson = `상위 ${(handPct * 100).toFixed(0)}% 핸드는 이 포지션의 기준(${(thr * 100).toFixed(0)}%)보다 훨씬 약합니다. 뒤에 남은 플레이어에게 3벳이나 어려운 포스트플랍 팟을 허용하게 됩니다.`; alternatives.push('폴드'); }
      } else if (type === 'call') {
        if (hu) { score = 78; lesson = '헤즈업에서 SB 림프는 가능한 선택이지만 레이즈가 보통 더 높은 빈도로 쓰입니다.'; }
        else { score = handPct <= thr ? 62 : 40; mistake = '림프(추정)'; lesson = '림프는 주도권을 포기하고 뒤 플레이어에게 싼 가격을 줍니다. 참여할 핸드라면 레이즈, 아니면 폴드가 기본입니다.'; alternatives.push(handPct <= thr ? '레이즈' : '폴드'); }
      } else if (type === 'fold') {
        const late = ['BTN', 'CO', 'SB', 'BTN/SB'].includes(obs.position);
        if (late && handPct <= thr * 0.6) { score = 55; mistake = '너무 타이트한 폴드(추정)'; lesson = '이 포지션에서는 이 정도 핸드로 오픈해 블라인드를 노리는 것이 보통입니다.'; alternatives.push('레이즈(스틸)'); }
        else { score = 92; lesson = '범위 밖 핸드를 접은 올바른 폴드입니다.'; }
      }
    } else if (deep && deep.chosen) {
      const P = pot + toCall;
      const bbv = rec.config.bb;
      const best = deep.best; const ch = deep.chosen;
      score = deep.loss <= 1e-9 ? 96 : Math.round(100 * (1 - Math.min(1, (deep.loss / Math.max(1, P)) * 3.5)));
      const sizeOnly = best.to !== undefined && ch.to !== undefined;
      if (!deep.significant && best.id !== ch.id) { borderline = true; score = Math.max(score, 80); notes.push(`최선 후보(${best.label})와의 EV 차이 ${deep.loss.toFixed(0)}칩(±${(2 * deep.lossSE).toFixed(0)})이 오차 범위 안 — 경계선 판단`); }
      else if (best.id !== ch.id) {
        if (type === 'fold') { mistake = '과폴드(추정)'; lesson = `폴드(EV 0)보다 ${best.label}의 추정 EV가 ${best.ev.toFixed(0)}칩 높습니다. 상대의 행동 라인에 비해 내 핸드가 충분히 강합니다.`; }
        else if (type === 'call' && best.id === 'fold') { mistake = '과콜(추정)'; lesson = '상대의 라인(레인지)에 비해 승률이 모자라 콜의 추정 EV가 폴드보다 낮습니다. 드로우의 이후 스트리트 가치는 실현율 상수로만 반영됩니다.'; }
        else if (type === 'call') { mistake = '수동적 플레이(추정)'; lesson = `콜보다 ${best.label}의 추정 EV가 높습니다. 상대가 접는 빈도나 밸류 가치가 큰 상황입니다.`; }
        else if (type === 'check') { mistake = '기회 놓침(추정)'; lesson = `체크보다 ${best.label}의 추정 EV가 높습니다. 상대가 약한 라인을 보인 스팟입니다.`; }
        else if (sizeOnly) { mistake = '베팅 사이즈 개선(추정)'; lesson = `방향은 맞지만 ${best.label}가 추정 EV가 더 높았습니다.`; score = Math.max(score, 66); }
        else { mistake = '과한 공격(추정)'; lesson = `공격보다 ${best.label}의 추정 EV가 높습니다. 상대가 계속하는 레인지가 내 핸드보다 강한 편입니다.`; }
      } else lesson = type === 'fold' ? '추정상 폴드가 최선인 올바른 판단입니다.' : type === 'call' ? '추정상 콜이 최선입니다.' : type === 'check' ? '추정상 체크가 최선입니다.' : '추정상 가장 EV가 높은 공격(방향·사이즈)입니다.';
      if (type === 'bet' || type === 'raise') notes.push(`${l.isBet ? '벳' : '레이즈'} 크기: 팟의 ${(100 * ev.paid / Math.max(1, pot)).toFixed(0)}%${deep.chosen.foldProb !== undefined ? ` · 상대 전원 폴드 확률(모델) ${(100 * deep.chosen.foldProb).toFixed(0)}%` : ''}`);
      [...deep.options].sort((x, y) => y.ev - x.ev).slice(0, 5).forEach((o) => notes.push(`EV ${o.ev >= 0 ? '+' : ''}${o.ev.toFixed(0)}칩 (±${(2 * o.se).toFixed(0)}) — ${o.label}${o.id === ch.id ? ' ← 내 선택' : o.id === best.id ? ' ← 최선' : ''}`));
      if (best.id !== ch.id) alternatives.push(`${best.label} (추정 EV ${best.ev.toFixed(0)}칩 vs 내 선택 ${ch.ev.toFixed(0)}칩)`);
      notes.push(deep.model);
      void bbv;
    } else if (type === 'check') {
      score = 85; lesson = '무난한 체크입니다.';
    }
    if (!deep && type === 'raise' && equity < 0.5 && toCall > 0 && !mistake) alternatives.push(`콜 (모델 EV ≈ ${evCall!.toFixed(0)} 칩)`);
    const evLossBB = deep ? (deep.significant && mistake ? deep.loss / rec.config.bb : 0)
      : need !== null && (type === 'fold' || type === 'call') && !borderline && mistake
        ? Math.max(0, (Math.max(evCall!, 0) - (type === 'call' ? evCall! : 0))) / rec.config.bb : 0;
    const deepOut: DecisionReview['deep'] = deep ? {
      options: deep.options.map((o) => ({ label: o.label, ev: o.ev, se: o.se, foldProb: o.foldProb, chosen: o.id === deep!.chosen?.id, best: o.id === deep!.best.id })),
      ranges: deep.ranges.map((r) => ({ name: r.name, line: r.line, top: r.top, share: r.share })),
      lossBB: deep.loss / rec.config.bb, lossSEBB: deep.lossSE / rec.config.bb, significant: deep.significant, model: deep.model,
    } : undefined;
    decisions.push({
      position: obs.position, actionType: type as DecisionReview['actionType'], handKey: key, opponents: opp.length, evLossBB,
      facingBet: toCall > 0, betFracOfPot: type === 'bet' || type === 'raise' ? ev.paid / Math.max(1, pot) : null,
      facedFracOfPot: toCall > 0 ? toCall / Math.max(1, pot - toCall) : null, stackBB: (before.players[heroSeat].stack + before.players[heroSeat].bet) / rec.config.bb,
      preflopRaisesFaced: raisesFaced,
      actionIndex: idx, street: obs.street, actionLabel: label, pot, toCall, equity, equitySE: se, rangeUncertainty: unc,
      potOddsNeed: need, evCall, score, grade: score === null ? null : gradeOf(score), mistake, notes, alternatives,
      lesson: lesson || '평가 정보가 부족합니다.', borderline, deep: deepOut,
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
