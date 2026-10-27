import { Card, rankOf, suitOf } from '../engine/cards';
import { RNG } from '../engine/rng';
import { Action, AllInAction } from '../engine/types';
import { estimateEquity, holePct, OppRange } from './equity';
import { handKey } from './handKey';
import { estimate, OppModel } from './opponentModel';
import { Observation, PublicPlayer } from './observation';
import { AISetup, applyMood, PROFILES, resolveStyle, Skill, SKILLS, Style } from './profiles';

export interface Decision {
  action: Action | AllInAction;
  /** 훈련/복기용 근거 (실전 UI에서는 숨김) */
  info: { equity?: number; handPct?: number; need?: number; note: string; approx: boolean };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
function gauss(rng: RNG) { return Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next()); }

export const OPEN_BASE: Record<string, number> = {
  UTG: 0.14, 'UTG+1': 0.16, MP: 0.18, 'MP+1': 0.2, HJ: 0.22, CO: 0.28, BTN: 0.45, SB: 0.38, 'BTN/SB': 0.75, BB: 0.0,
};

/** AI 의사결정 — 오직 Observation 과 자신의 설정/기억만 사용한다. */
export function decide(obs: Observation, setup: AISetup, memory: OppModel, rng: RNG, gameSeed = 0, simScale = 1): Decision {
  const hero0 = obs.players[obs.seat];
  const ratio = obs.startStack ? (hero0.stack + hero0.bet) / obs.startStack : 1;
  const style = applyMood(resolveStyle(setup.profileId, obs.handNo, gameSeed), ratio);
  const skill = simScale === 1 ? SKILLS[setup.difficulty] : { ...SKILLS[setup.difficulty], sims: Math.max(20, Math.round(SKILLS[setup.difficulty].sims * simScale)) };
  const legal = obs.legal;
  const safe = (action: Action | AllInAction, info: Decision['info']): Decision => ({ action: sanitize(action, obs), info });
  try {
    const d = obs.street === 'preflop' ? preflop(obs, style, setup, memory, rng, skill) : postflop(obs, style, setup, memory, rng, skill);
    // 의도치 않은 실수: 폴드↔콜 뒤집기 (합법 행동 범위 안에서만)
    if (rng.next() < skill.mistake) {
      if (d.action.type === 'fold' && legal.canCall && obs.legal.callAmount <= obs.pot * 0.6) return safe({ type: 'call' }, { ...d.info, note: d.info.note + ' [실수:과콜]' });
      if (d.action.type === 'call' && legal.canFold && obs.legal.callAmount >= obs.pot * 0.3) return safe({ type: 'fold' }, { ...d.info, note: d.info.note + ' [실수:과폴드]' });
    }
    return safe(d.action, d.info);
  } catch {
    // 계산 실패 → 재현 가능한 합법 대체 정책: 체크 가능하면 체크, 아니면 폴드
    return safe(legal.canCheck ? { type: 'check' } : { type: 'fold' }, { note: '대체 정책', approx: true });
  }
}

/** 어떤 경우에도 합법 행동만 반환 */
export function sanitize(a: Action | AllInAction, obs: Observation): Action | AllInAction {
  const l = obs.legal;
  if (a.type === 'allin') return l.canRaise ? a : l.canCall ? { type: 'call' } : l.canCheck ? { type: 'check' } : { type: 'fold' };
  if (a.type === 'bet' || a.type === 'raise') {
    if (!l.canRaise) return l.canCall ? { type: 'call' } : { type: 'check' };
    const to = clamp(Math.round(a.to ?? l.minTo), l.minTo, l.maxTo);
    return { type: l.isBet ? 'bet' : 'raise', to };
  }
  if (a.type === 'check') return l.canCheck ? a : l.canCall ? { type: 'fold' } : a;
  if (a.type === 'call') return l.canCall ? a : l.canCheck ? { type: 'check' } : a;
  if (a.type === 'fold') return l.canFold ? a : { type: 'check' };
  return a;
}

/** 버블 압력 0~1 (남은 인원 − 입상 인원: 1→1.0, 2→0.6, 3→0.3) */
export function bubbleFactor(obs: Observation): number {
  if (!obs.tournament) return 0;
  const d = obs.tournament.playersLeft - obs.tournament.paid;
  return d === 1 ? 1 : d === 2 ? 0.6 : d === 3 ? 0.3 : 0;
}

function raiseTo(obs: Observation, to: number): Action | AllInAction {
  const l = obs.legal;
  if (!l.canRaise) return l.canCall ? { type: 'call' } : { type: 'check' };
  const t = clamp(Math.round(to), l.minTo, l.maxTo);
  // 스택의 약 2/3 이상이면 올인으로 전환 (커밋)
  const hero = obs.players[obs.seat];
  if (t >= (hero.stack + hero.bet) * 0.65 || l.maxTo - t < obs.bb) return { type: 'allin' };
  return { type: l.isBet ? 'bet' : 'raise', to: t };
}

const activeOpp = (obs: Observation): PublicPlayer[] => obs.players.filter((p) => !p.isHero && p.inHand && !p.folded);

// ───────────── 프리플랍 ─────────────
function preflop(obs: Observation, st: Style, setup: AISetup, mem: OppModel, rng: RNG, skill: Skill): Decision {
  const l = obs.legal;
  const hero = obs.players[obs.seat];
  const key = handKey(obs.hole[0], obs.hole[1]);
  const pct = clamp(holePct(obs.hole[0], obs.hole[1]) + gauss(rng) * skill.noise * 0.5, 0, 1);
  const bb = obs.bb;
  const bbs = obs.effStack / bb;
  const raiseEvents = obs.history.filter((e) => e.street === 'preflop' && (e.type === 'raise' || e.type === 'bet'));
  const raises = raiseEvents.length;
  const limpers = obs.history.filter((e) => e.street === 'preflop' && e.type === 'call').length;
  const opp = activeOpp(obs);
  const pos = obs.position;
  const lateOpener = raises > 0 && ['CO', 'BTN', 'BTN/SB', 'SB'].includes(obs.players[raiseEvents[0].seat].position);
  const aggressorStats = raises > 0 ? mem[obs.players[raiseEvents[raiseEvents.length - 1].seat].id] : undefined;
  const info = (note: string, need?: number): Decision['info'] => ({ handPct: pct, need, note, approx: true });

  // 숏스택 푸시/폴드 (근사 공식: 솔버 데이터 아님)
  if (bbs <= 12 && raises <= 1) {
    const posMul: Record<string, number> = { UTG: 0.7, 'UTG+1': 0.75, MP: 0.85, 'MP+1': 0.9, HJ: 1, CO: 1.1, BTN: 1.25, SB: 1.2, 'BTN/SB': 1.35, BB: 1 };
    let shove = clamp(3.0 * Math.pow(Math.max(bbs, 1), -0.95) * (posMul[pos] ?? 1) * clamp(st.vpipMul, 0.6, 1.6), 0.04, 0.95);
    if (raises === 0) {
      if (pct <= shove) return { action: { type: 'allin' }, info: info(`푸시 (${bbs.toFixed(1)}BB, 상위 ${(shove * 100).toFixed(0)}%)`) };
      if (l.canCheck) return { action: { type: 'check' }, info: info('체크') };
      return { action: { type: 'fold' }, info: info('폴드 (숏스택)') };
    }
    // 올인/레이즈에 직면: 콜 범위 = 팟오즈 기반
    const callNeed = l.callAmount / (obs.pot + l.callAmount);
    const oppShove = clamp(3.0 * Math.pow(Math.max(obs.effStack / bb, 1), -0.95), 0.05, 0.9);
    const callPct = clamp(oppShove * (1 - callNeed) * 1.0 * (0.7 + 0.6 * st.bluffCatch), 0.03, 0.85);
    if (pct <= callPct * (0.9 + 0.2 * skill.pushFoldAcc)) return { action: l.canRaise && pct < 0.03 ? { type: 'allin' } : { type: 'call' }, info: info('콜 (숏스택)', callNeed) };
    return { action: { type: 'fold' }, info: info('폴드 (숏스택)', callNeed) };
  }

  const nHands = opp.length + 1;
  const tableScale = nHands >= 8 ? 0.85 : 1;
  // 토너먼트 압력: 버블 근처에서는 중간 스택이 타이트해지고, 큰 스택은 압박을 건다
  const bf = bubbleFactor(obs);
  const ratio = obs.tournament ? hero.stack / Math.max(1, obs.tournament.avgStack) : 1;
  const icmTight = bf > 0 && ratio >= 0.5 && ratio <= 1.8 && bbs > 12 ? 1 - 0.3 * bf : 1;
  const bigPress = bf > 0 && ratio > 1.8 ? 1 + 0.25 * bf : 1;

  if (raises === 0) {
    // 함정형: 최상위 핸드로 림프해 리레이즈를 노린다
    if (st.trap > 0.3 && pct <= 0.025 && pos !== 'BB' && l.canCall && rng.next() < st.trap * 0.6) return { action: { type: 'call' }, info: info('함정 림프 (프리미엄)') };
    // 오픈 (BB 는 체크 옵션)
    const base = OPEN_BASE[pos] ?? 0.2;
    let openPct = clamp(base * st.vpipMul * tableScale * (limpers > 0 ? 0.8 : 1) * (icmTight < 1 ? 0.88 : 1) * bigPress, 0, 0.95);
    if (pos === 'BB') {
      // 림퍼 고립 레이즈
      if (limpers > 0 && pct <= 0.12 * st.threeBet * st.vpipMul) return { action: raiseTo(obs, (st.openSize + limpers) * bb + bb), info: info('림퍼 고립') };
      return { action: { type: 'check' }, info: info('BB 체크') };
    }
    if (pct <= openPct) {
      const size = (st.openSize + limpers) * bb;
      // 매우 좋은 핸드의 슬로우플레이/림프는 콜링스테이션류에서만
      if (limpers === 0 && st.foldToRaise < 0.25 && st.threeBet < 0.5 && rng.next() < 0.5) return { action: l.canCall ? { type: 'call' } : { type: 'check' }, info: info('림프') };
      return { action: raiseTo(obs, size), info: info(`오픈 (상위 ${(openPct * 100).toFixed(0)}%)`) };
    }
    // 림프 영역: 느슨한 스타일
    if (pct <= openPct * 1.4 && st.foldToRaise < 0.3 && (l.canCall)) return { action: { type: 'call' }, info: info('림프') };
    if (l.canCheck) return { action: { type: 'check' }, info: info('체크') };
    return { action: { type: 'fold' }, info: info('폴드') };
  }

  // 레이즈에 직면
  const lastRaiseTo = Math.max(...raiseEvents.map((e) => e.toTotal));
  const sizeBB = lastRaiseTo / bb;
  const sizePenalty = clamp(2.5 / Math.max(sizeBB, 1.5), 0.35, 1.2);
  const foldAdj = 1 - (st.foldToRaise - 0.5) * 0.9;
  // 상대 적응: 상대 PFR 이 높을수록 넓게 대응
  let widen = 1;
  if (aggressorStats && skill.rangeReading > 0) {
    const pfr = estimate.pfr(aggressorStats);
    widen = 1 + (pfr - 0.15) * 3 * st.adapt * skill.rangeReading;
    widen = clamp(widen, 0.6, 1.8);
  }
  const posBonus = ['BTN', 'BTN/SB', 'CO'].includes(pos) ? 1.3 : pos === 'BB' ? 1.25 : 1;
  const posPenalty = ['UTG', 'UTG+1'].includes(pos) ? 0.8 : 1;
  if (raises === 1) {
    // 스퀴즈: 오픈 레이즈 뒤에 콜러가 있으면 3벳 빈도·크기를 늘린다
    const raiseIdx = obs.history.findIndex((e) => e.street === 'preflop' && (e.type === 'raise' || e.type === 'bet'));
    const callersAfter = obs.history.slice(raiseIdx + 1).filter((e) => e.street === 'preflop' && e.type === 'call').length;
    const squeeze = 1 + 0.45 * callersAfter;
    const tb = clamp(0.045 * st.threeBet * (lateOpener ? 1.6 : 1) * widen * posPenalty * bigPress * squeeze, 0.01, 0.4);
    const callPct = clamp(0.11 * st.vpipMul * posBonus * sizePenalty * foldAdj * widen * icmTight, 0.01, 0.8);
    const toCall = l.callAmount;
    const potOddsNeed = toCall / (obs.pot + toCall);
    if (pct <= tb) {
      return { action: raiseTo(obs, lastRaiseTo * (['BTN', 'BTN/SB', 'CO'].includes(pos) ? 3 : 3.8) + (limpers + callersAfter) * lastRaiseTo * 0.9), info: info(callersAfter ? '스퀴즈 (밸류)' : '3벳 (밸류)') };
    }
    // 블러프 3벳: A5s 류/수티드 커넥터 일부
    const bluffable = /^A[2-5]s$/.test(key) || /^(T9s|98s|87s|76s|65s|KQo|KJs)$/.test(key);
    if (bluffable && rng.next() < st.bluff * 0.28 * st.threeBet * widen * (skill.mistake > 0.1 ? 1.4 : 1)) {
      return { action: raiseTo(obs, lastRaiseTo * 3.4), info: info('3벳 (블러프)') };
    }
    // 빅블라인드 방어: 이미 낸 칩과 팟오즈 때문에 실제로는 훨씬 넓게 방어한다 (헤즈업 BB ≈ 50%, 6-max BB vs 레이트 ≈ 40%)
    let defendPct = callPct;
    if (pos === 'BB' && callersAfter === 0) {
      const target = 0.3 * (0.27 / Math.max(0.12, potOddsNeed)) * (lateOpener ? 1.55 : 1) * (nHands === 2 ? 1.5 : 1) * Math.pow(st.vpipMul, 0.7) * foldAdj * icmTight;
      defendPct = clamp(Math.max(callPct, target * (0.85 + 0.15 * skill.potOddsAware)), 0.01, 0.72);
    }
    if (pct <= defendPct && potOddsNeed < 0.45 + st.bluffCatch * 0.2) return { action: { type: 'call' }, info: info(`콜 (상위 ${(defendPct * 100).toFixed(0)}%)`, potOddsNeed) };
    if (l.canCheck) return { action: { type: 'check' }, info: info('체크') };
    return { action: { type: 'fold' }, info: info('폴드', potOddsNeed) };
  }
  // 4벳 이상
  const cont = clamp((raises === 2 ? 0.03 : 0.015) * foldAdj * st.threeBet * widen * icmTight, 0.005, 0.2);
  if (pct <= cont) return { action: pct < 0.012 ? { type: 'allin' } : l.canRaise ? raiseTo(obs, lastRaiseTo * 2.3) : { type: 'call' }, info: info('4벳+') };
  const toCall = l.callAmount;
  if (pct <= cont * 1.8 && toCall / (obs.pot + toCall) < 0.4) return { action: { type: 'call' }, info: info('콜 (4벳+)') };
  void hero;
  return { action: { type: 'fold' }, info: info('폴드 (4벳+)') };
}

// ───────────── 포스트플랍 ─────────────
function oppRange(obs: Observation, o: PublicPlayer, st: Style, skill: ReturnType<typeof Object.create>, mem: OppModel): OppRange {
  let pct = 0.5;
  let top = 1;
  const evs = obs.history.filter((e) => e.seat === o.seat && e.type !== 'sb' && e.type !== 'bb' && e.type !== 'ante');
  let preRaises = 0;
  for (const e of evs) {
    if (e.street === 'preflop') {
      if (e.type === 'raise' || e.type === 'bet') { preRaises++; pct = preRaises === 1 ? 0.2 : 0.09; }
      else if (e.type === 'call') pct = Math.min(pct, 0.32);
    } else if (e.type === 'bet' || e.type === 'raise') top *= e.street === 'river' ? 0.35 : 0.42;
    else if (e.type === 'call') top *= 0.62;
  }
  // 적응: 관측된 VPIP/PFR 로 프리플랍 레인지 보정
  const stat = mem[o.id];
  if (stat && stat.hands >= 8 && st.adapt > 0) {
    const w = clamp(st.adapt * skill.rangeReading, 0, 1) * 0.5;
    pct = pct * (1 - w) + clamp(estimate.vpip(stat) * 0.9, 0.08, 0.9) * w * (preRaises ? 0.5 : 1);
  }
  const reading = skill.rangeReading as number;
  return { pct: clamp(pct * reading + 1 * (1 - reading), 0.04, 1), boardTop: clamp(top * reading + 1 * (1 - reading), 0.05, 1) };
}

/** 보드 텍스처: 0(매우 드라이) ~ 1(매우 웻). 같은 무늬 집중과 연결성(스트레이트 가능성)으로 계산 */
export function boardWetness(board: Card[]): number {
  if (board.length < 3) return 0;
  const suits = [0, 0, 0, 0];
  board.forEach((c) => suits[suitOf(c)]++);
  const flushy = Math.max(...suits) >= 3 ? 1 : Math.max(...suits) === 2 ? 0.35 : 0;
  const rs = [...new Set(board.map(rankOf))].sort((a, b) => a - b);
  let conn = 0;
  for (let i = 1; i < rs.length; i++) { const gap = rs[i] - rs[i - 1]; if (gap === 1) conn += 1; else if (gap === 2) conn += 0.6; else if (gap === 3) conn += 0.25; }
  const paired = rs.length < board.length ? -0.15 : 0;
  return clamp(0.55 * flushy + 0.28 * Math.min(conn, 2.5) + paired, 0, 1);
}

function boardDraws(board: Card[], hole: Card[]): boolean {
  const cards = [...hole, ...board];
  const sc = [0, 0, 0, 0];
  cards.forEach((c) => sc[suitOf(c)]++);
  if (sc.some((n) => n === 4)) return true;
  const rs = [...new Set(cards.map(rankOf))].sort((a, b) => a - b);
  let run = 1;
  for (let i = 1; i < rs.length; i++) { run = rs[i] === rs[i - 1] + 1 ? run + 1 : 1; if (run >= 4) return true; }
  return false;
}

function postflop(obs: Observation, st: Style, setup: AISetup, mem: OppModel, rng: RNG, skill: Skill): Decision {
  const l = obs.legal;
  const hero = obs.players[obs.seat];
  const opp = activeOpp(obs);
  const pcts = opp.map((o) => oppRange(obs, o, st, skill, mem));
  const sims = Math.max(30, Math.round(skill.sims / Math.sqrt(Math.max(1, opp.length))));
  let eq = estimateEquity(obs.hole, obs.board, pcts, sims, rng);
  eq = clamp(eq + gauss(rng) * skill.noise + skill.eqBias, 0, 1);
  const pot = obs.pot;
  const toCall = l.callAmount;
  const nOpp = opp.length;
  const isLastToAct = isLast(obs);
  // 에퀴티 실현 할인: 포지션 불리 + 남은 스트리트에서 추가 베팅 압박 (상급 AI 만 반영)
  const callEq = eq - skill.realize * (obs.street === 'river' ? 0 : (isLastToAct ? 0.025 : 0.07) + 0.015 * (nOpp - 1));
  const info = (note: string, need?: number): Decision['info'] => ({ equity: eq, need, note, approx: true });
  const preAgg = obs.history.filter((e) => e.street === 'preflop' && (e.type === 'raise')).pop()?.seat === obs.seat;
  const inPosition = isLast(obs);
  const mainOpp = opp[0] ? mem[opp[0].id] : undefined;
  const spr = obs.effStack / Math.max(1, obs.pot);

  // 적응 보정
  let bluffMul = 1, callAdj = 0;
  if (mainOpp && mainOpp.hands >= 10 && skill.rangeReading > 0) {
    const k = st.adapt * skill.exploit;
    const fcb = estimate.foldToCbet(mainOpp);
    bluffMul = clamp(1 + (fcb - 0.45) * 3 * k, 0.3, 2.4);
    const af = estimate.aggFreq(mainOpp);
    callAdj = clamp((af - 0.4) * 0.25 * k, -0.05, 0.1); // 공격적인 상대에겐 더 얇게 콜
    // 거의 폴드하지 않는 상대에겐 블러프를 줄이고 밸류를 두껍게
    if (fcb < 0.3) bluffMul *= clamp(0.5 + fcb, 0.3, 1);
  }

  const betTo = (frac: number) => obs.currentBet + Math.max(obs.bb, frac * (pot + toCall)) + (obs.currentBet > 0 ? toCall * 0 : 0);

  if (l.canCall) {
    // 베팅에 직면
    const odds = toCall / (pot + toCall);
    const icmPrem = obs.tournament ? bubbleFactor(obs) * 0.05 * (obs.tournament && hero.stack / Math.max(1, obs.tournament.avgStack) <= 1.8 ? 1 : 0) : 0;
    const need = clamp(odds * skill.potOddsAware + 0.38 * (1 - skill.potOddsAware) - (st.bluffCatch - 0.5) * 0.12 - callAdj + (nOpp > 1 ? 0.02 : 0) + icmPrem, 0.05, 0.97);
    const valueRaise = st.valueThresh + 0.17;
    if (l.canRaise && eq >= valueRaise && rng.next() < 0.45 + st.checkRaise * 2 + (inPosition ? 0.1 : 0)) {
      return { action: raiseTo(obs, obs.currentBet * (2.6 + st.betSize * 0.6) + 0), info: info('밸류 레이즈', need) };
    }
    // 세미블러프 레이즈
    if (l.canRaise && obs.street !== 'river' && eq > 0.28 && eq < need + 0.05 && boardDraws(obs.board, obs.hole) && rng.next() < st.bluff * 0.3 * bluffMul) {
      return { action: raiseTo(obs, obs.currentBet * 2.8), info: info('세미블러프 레이즈', need) };
    }
    // 순수 블러프 레이즈 (매니악류)
    if (l.canRaise && eq < 0.2 && rng.next() < Math.max(0, st.bluff - 0.4) * 0.35 * bluffMul) {
      return { action: raiseTo(obs, obs.currentBet * 3), info: info('블러프 레이즈', need) };
    }
    if (callEq >= need) return { action: { type: 'call' }, info: info('콜', need) };
    return { action: { type: 'fold' }, info: info('폴드', need) };
  }

  // 체크 가능 — 벳 여부
  const valueT = st.valueThresh + (nOpp - 1) * 0.04 - (obs.street === 'river' ? 0 : 0.0);
  if (eq >= valueT) {
    // SPR 이 낮으면(스택 대비 팟이 큼) 강한 핸드는 바로 커밋
    if (spr < 2 && eq >= valueT + 0.05 && l.canRaise) return { action: { type: 'allin' }, info: info('SPR 낮음: 커밋') };
    const slow = obs.street !== 'river' && (st.trap > 0 ? rng.next() < st.trap * 0.75 && eq > 0.78 : rng.next() < 0.12 * (1 - st.bluff) && inPosition === false);
    if (!slow) {
      const frac = clamp(st.betSize + (eq > 0.85 ? 0.2 : 0) + gauss(rng) * 0.05, 0.25, 1.3);
      return { action: raiseTo(obs, frac * pot), info: info('밸류 벳') };
    }
    return { action: { type: 'check' }, info: info('슬로우플레이') };
  }
  const multiway = Math.pow(0.8, nOpp - 1);
  // 보드 텍스처: 드라이한 보드는 작은 사이즈로 자주, 웻한 보드는 크게(또는 덜 자주)
  const wet = boardWetness(obs.board);
  if (obs.street === 'flop' && preAgg && rng.next() < st.cbet * multiway * (inPosition ? 1 : 0.92) * clamp(bluffMul, 0.5, 1.6) * (1.12 - 0.3 * wet)) {
    const frac = clamp(0.28 + (st.betSize - 0.6) * 0.5 + 0.35 * wet, 0.25, 0.9);
    return { action: raiseTo(obs, frac * pot), info: info('C-bet') };
  }
  // 블러프 (약한 핸드, 리버는 에어일 때)
  const air = obs.street === 'river' ? eq < 0.18 : eq < 0.4;
  if (air && rng.next() < st.bluff * 0.3 * multiway * bluffMul * (inPosition ? 1.15 : 0.9) && hero.stack > pot * 0.3) {
    return { action: raiseTo(obs, clamp(st.betSize, 0.4, 1.1) * pot), info: info('블러프') };
  }
  // 얇은 밸류: 어그레시브 스타일은 중간 핸드도 벳
  if (eq > valueT - 0.1 && rng.next() < (st.bluff - 0.2) * 0.4 && st.valueThresh < 0.58) {
    return { action: raiseTo(obs, 0.4 * pot), info: info('얇은 밸류') };
  }
  return { action: { type: 'check' }, info: info('체크') };
}

/** 영웅이 이번 스트리트에서 마지막으로 행동하는 자리(대략)인지 */
function isLast(obs: Observation): boolean {
  const n = obs.players.length;
  const live = obs.players.filter((p) => p.inHand && !p.folded);
  const dist = (s: number) => (s - obs.button + n) % n;
  return live.every((p) => dist(p.seat) <= dist(obs.seat));
}

/** 복기/분석용: 중립 설정(적응 없음, 최대 레인지 추론)으로 상대 레인지 추정 */
export function inferRange(obs: Observation, o: PublicPlayer): OppRange {
  return oppRange(obs, o, { ...PROFILES.Balanced.style, adapt: 0 }, SKILLS[5], {});
}
