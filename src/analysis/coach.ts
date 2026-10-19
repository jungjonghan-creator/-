import { evaluate, categoryOf } from '../engine/evaluator';
import { replayRecord } from '../engine/replay';
import { createRng, RNG } from '../engine/rng';
import { Card, newDeck, cardToString } from '../engine/cards';
import { HandRecord } from '../engine/types';
import { positionLabels } from '../ai/observation';
import { Stats, updateModel, estimate } from '../ai/opponentModel';
import { DecisionReview, Grade, HandReview, reviewHand } from './review';
import { heroStats } from './stats';

// ───────────────────────── 올인 EV (운 보정) ─────────────────────────
export interface LuckResult { applicable: boolean; actual: number; expected: number; luck: number; heroEquity: number; street: string }

/** 올인(더 이상 베팅 불가) 시점의 실제 패를 알고 있을 때, 남은 보드 전개의 평균으로 기대 손익을 계산한다. */
export function allInLuck(rec: HandRecord, heroSeat: number, rng: RNG, samples = 2500): LuckResult {
  const none: LuckResult = { applicable: false, actual: 0, expected: 0, luck: 0, heroEquity: 0, street: '' };
  const res = rec.result;
  if (!res || res.endedByFold) return none;
  const lastBetting = rec.events.filter((e) => e.type !== 'sb' && e.type !== 'bb' && e.type !== 'ante');
  if (!lastBetting.length) return none;
  const street = lastBetting[lastBetting.length - 1].street;
  const known = street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
  if (known >= 5) return none;
  if (!res.shown[heroSeat]) return none;
  const contenders = Object.keys(res.shown).map(Number);
  if (contenders.length < 2) return none;
  const actualWin = res.pots.reduce((t, p) => t + (p.share[heroSeat] ?? 0), 0);
  const invested = actualWin + (res.returned[heroSeat] ?? 0) - (res.net[heroSeat] ?? 0);
  const boardKnown = rec.board.slice(0, known);
  const used = new Set<Card>([...boardKnown, ...contenders.flatMap((s) => res.shown[s].hole)]);
  const pool = newDeck().filter((c) => !used.has(c));
  let winSum = 0, eqSum = 0;
  for (let n = 0; n < samples; n++) {
    for (let i = 0; i < 5 - known; i++) { const j = i + rng.int(pool.length - i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const board = [...boardKnown, ...pool.slice(0, 5 - known)];
    const score: Record<number, number> = {};
    for (const s of contenders) score[s] = evaluate([...res.shown[s].hole, ...board]);
    let w = 0;
    for (const pot of res.pots) {
      const el = pot.eligible.filter((s) => score[s] !== undefined);
      if (!el.length || !el.includes(heroSeat)) continue;
      const best = Math.max(...el.map((s) => score[s]));
      const winners = el.filter((s) => score[s] === best);
      if (winners.includes(heroSeat)) w += pot.amount / winners.length;
    }
    winSum += w;
    const mainEl = res.pots[0].eligible.filter((s) => score[s] !== undefined);
    const b = Math.max(...mainEl.map((s) => score[s]));
    if (score[heroSeat] === b) eqSum += 1 / mainEl.filter((s) => score[s] === b).length;
  }
  const expected = winSum / samples + (res.returned[heroSeat] ?? 0) - invested;
  const actual = res.net[heroSeat] ?? 0;
  return { applicable: true, actual, expected, luck: actual - expected, heroEquity: eqSum / samples, street };
}

// ───────────────────────── 핸드 직후 코치 카드 ─────────────────────────
export type CoachTone = 'good' | 'warn' | 'luck' | 'neutral';
export interface QuickCoach {
  tone: CoachTone;
  headline: string;
  points: string[];
  keyDecisionIndex: number | null;
  luck: LuckResult | null;
}

const fmt = (n: number) => (n >= 0 ? '+' : '') + Math.round(n).toLocaleString();
const pct = (x: number) => `${Math.round(x * 100)}%`;
const streetKo: Record<string, string> = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };

function describeMistake(d: DecisionReview, bb: number): string {
  const need = d.potOddsNeed !== null ? pct(d.potOddsNeed) : '-';
  if (d.mistake?.startsWith('과폴드')) return `${streetKo[d.street]}에서 ${d.facedFracOfPot !== null ? `팟의 ${Math.round(d.facedFracOfPot * 100)}% 벳` : '벳'}을 접었습니다. 이기는 비율 추정 ${pct(d.equity)}, 콜에 필요한 비율 ${need}. 콜이 약 ${(Math.max(0, d.evCall ?? 0) / bb).toFixed(1)}BB 유리했을 수 있어요.`;
  if (d.mistake?.startsWith('과콜')) return `${streetKo[d.street]}에서 콜 ${Math.round(d.toCall).toLocaleString()}을 했지만 승률 추정 ${pct(d.equity)}로 필요 ${need}에 못 미쳤습니다. 이 콜은 평균적으로 ${(Math.abs(Math.min(0, d.evCall ?? 0)) / bb).toFixed(1)}BB 손해로 추정됩니다.`;
  if (d.mistake?.startsWith('밸류')) return `${streetKo[d.street]}에서 승률 ${pct(d.equity)}의 강한 핸드로 체크했습니다. 상대가 벳해 주길 기다리기보다 직접 밸류를 뽑는 편이 보통 이득입니다.`;
  if (d.mistake?.startsWith('과대')) return `${streetKo[d.street]}에서 승률 ${pct(d.equity)}인 핸드로 팟의 ${Math.round((d.betFracOfPot ?? 0) * 100)}%를 베팅했습니다. 약한 핸드의 큰 베팅은 더 강한 핸드만 콜하게 만듭니다.`;
  if (d.mistake?.startsWith('범위 밖')) return `${d.position}에서 ${d.handKey}(프리플랍 상위 약 ${Math.round((d.equity) * 0)}%)`.replace(/\(프리플랍.*\)/, '') + '로 오픈했습니다. 이 자리의 기준보다 약한 핸드입니다. ' + d.lesson;
  if (d.mistake?.startsWith('림프')) return `${d.position}에서 ${d.handKey}로 림프했습니다. ${d.lesson}`;
  if (d.mistake?.startsWith('너무 타이트')) return `${d.position}에서 ${d.handKey}를 접었습니다. ${d.lesson}`;
  return d.lesson;
}

export function quickCoach(rec: HandRecord, review: HandReview, luck: LuckResult | null): QuickCoach {
  const bb = rec.config.bb;
  const net = review.heroNet;
  const ds = review.decisions;
  const points: string[] = [];
  const mistakes = ds.filter((d) => d.mistake).sort((a, b) => (a.score ?? 100) - (b.score ?? 100));
  const graded = ds.filter((d) => d.score !== null);

  if (luck?.applicable && Math.abs(luck.luck) >= bb * 8) {
    const fav = luck.heroEquity >= 0.5;
    points.push(luck.luck < 0
      ? `올인 시점 내 승률은 ${pct(luck.heroEquity)}였습니다(${streetKo[luck.street]}). 결과는 ${fmt(luck.actual)}이지만 평균 기대값은 ${fmt(luck.expected)} — 운이 ${Math.abs(Math.round(luck.luck / bb))}BB 나빴습니다.`
      : `올인 시점 내 승률은 ${pct(luck.heroEquity)}였습니다(${streetKo[luck.street]}). 기대값 ${fmt(luck.expected)}보다 ${Math.round(luck.luck / bb)}BB 더 얻었어요 — ${fav ? '유리한 판이 그대로 통했습니다' : '운이 도왔습니다'}.`);
  }
  let tone: CoachTone = 'neutral';
  let headline = '';
  let keyIdx: number | null = null;

  if (!ds.length) {
    headline = net > 0 ? '무혈입성 — 블라인드를 지켰습니다' : '이번 핸드는 내 결정이 없었습니다';
  } else if (mistakes.length) {
    const m = mistakes[0];
    keyIdx = m.actionIndex;
    tone = 'warn';
    headline = m.mistake!.replace('(추정)', '') + ' 가능성';
    points.unshift(describeMistake(m, bb));
    if (m.lesson) points.push('다음엔: ' + m.lesson);
  } else {
    const best = graded.filter((d) => (d.score ?? 0) >= 85).sort((a, b) => Math.abs(b.equity - (b.potOddsNeed ?? 0.5)) - Math.abs(a.equity - (a.potOddsNeed ?? 0.5)))[0];
    tone = luck?.applicable && luck.luck < -bb * 8 ? 'luck' : 'good';
    if (best) {
      keyIdx = best.actionIndex;
      if (best.actionType === 'fold' && best.potOddsNeed !== null) { headline = '좋은 폴드'; points.unshift(`${streetKo[best.street]} 폴드: 승률 추정 ${pct(best.equity)}로 필요 ${pct(best.potOddsNeed)}에 미달. 칩을 아꼈습니다.`); }
      else if (best.actionType === 'call' && best.potOddsNeed !== null) { headline = '정확한 콜'; points.unshift(`${streetKo[best.street]} 콜: 승률 추정 ${pct(best.equity)} > 필요 ${pct(best.potOddsNeed)}. 팟오즈가 맞는 콜입니다.`); }
      else if (best.actionType === 'bet' || best.actionType === 'raise') { headline = best.equity >= 0.55 ? '좋은 밸류 베팅' : '적극적인 플레이'; points.unshift(`${streetKo[best.street]} ${best.actionLabel}: 승률 추정 ${pct(best.equity)}. ${best.lesson}`); }
      else { headline = '무난한 진행'; points.unshift(best.lesson); }
    } else headline = '무난한 진행';
    if (tone === 'luck') headline = '판단은 좋았고, 운이 따르지 않았습니다';
  }
  if (net < 0 && tone === 'good' && !luck?.applicable) points.push('져도 판단이 합리적이었다면 장기적으로는 이득입니다. 결과와 판단을 분리해서 보세요.');
  if (net > 0 && tone === 'warn') points.push('이겼지만 위의 판단은 반복하면 손해로 이어집니다. 결과(운)에 속지 마세요.');
  return { tone, headline, points: points.slice(0, 4), keyDecisionIndex: keyIdx, luck };
}

// ───────────────────────── 심층 분석 리포트 ─────────────────────────
export interface Leak { id: string; title: string; severity: 1 | 2 | 3; evidence: string; advice: string; evLossBB: number; drill?: 'spot' | 'pushfold' }
export interface OpponentReport { id: string; name: string; hands: number; netBB: number; vpip: number | null; pfr: number | null; af: number | null; sample: number; advice: string }
export interface DeepReport {
  totalHands: number; analyzedHands: number; decisions: number;
  net: number; bb100: number | null;
  avgScore: number | null; gradeDist: Record<Grade, number>;
  scoreByStreet: { street: string; avg: number; n: number }[];
  scoreByPosition: { pos: string; avg: number; n: number; netBB100: number | null; hands: number }[];
  evLossBB: number; evLossPer100: number | null;
  mistakes: { type: string; count: number; evLossBB: number }[];
  leaks: Leak[]; strengths: string[];
  preflop: { pos: string; hands: number; vpip: number; range: [number, number]; verdict: 'tight' | 'ok' | 'loose' | 'n/a' }[];
  luck: { hands: number; actualBB: number; expectedBB: number; luckBB: number };
  /** 핸드별 누적 손익(BB): 실제 vs 올인 EV 보정 */
  series: { actual: number[]; adjusted: number[] };
  tilt: { triggers: number; postHands: number; vpipAfter: number | null; vpipBase: number | null; verdict: string };
  trend: { label: string; score: number }[];
  opponents: OpponentReport[];
  plan: { title: string; steps: string[]; drill?: 'spot' | 'pushfold' }[];
  summary: string;
}

const POS_RANGE: Record<string, [number, number]> = {
  UTG: [0.1, 0.2], 'UTG+1': [0.12, 0.22], MP: [0.14, 0.25], 'MP+1': [0.16, 0.27], HJ: [0.18, 0.3], CO: [0.24, 0.4], BTN: [0.36, 0.62], SB: [0.3, 0.55],
};

const ARCHETYPE_ADVICE: Record<string, string> = {
  TAG: '강한 핸드로만 큰 팟을 만듭니다. 그가 레이즈하면 존중하고, 체크한 팟에서 블러프로 압박하세요.',
  LAG: '자주 압박합니다. 중간 강도 핸드로 더 넓게 콜다운하고, 강한 핸드는 슬로우플레이로 함정을 파세요.',
  Nit: '레이즈에는 거의 항상 강한 핸드입니다. 그가 오픈하면 접고, 그가 체크하면 블라인드를 훔치세요.',
  CallingStation: '잘 접지 않습니다. 블러프를 줄이고 얇은 밸류벳을 두껍게, 큰 사이즈로 가져가세요.',
  Maniac: '거의 모든 팟에서 공격합니다. 강한 핸드를 만들면 끝까지 콜다운하고, 블러프는 접으세요.',
  Balanced: '기본기가 탄탄한 상대입니다. 포지션 우위를 살리고 큰 실수를 하지 않는 것이 승부처입니다.',
  AdaptivePro: '당신의 습관을 읽습니다. 같은 패턴을 반복하지 말고 일부러 빈도를 섞어 주세요.',
  Mixed: '경기마다 스타일이 바뀝니다. 최근 20핸드의 행동을 보고 매번 상대 유형을 다시 판단하세요.',
};

export interface PlayerMeta { id: string; name: string; profileId?: string }

function chunk<T>(a: T[], n: number): T[][] { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export async function deepReport(records: HandRecord[], players: PlayerMeta[], opts: { maxReviewHands?: number; sims?: number; onProgress?: (p: number) => void } = {}): Promise<DeepReport> {
  const heroId = 'hero';
  const recs = records.filter((r) => r.startStacks.find((s) => s.id === heroId && s.stack > 0));
  const maxReview = opts.maxReviewHands ?? 120;
  const sims = opts.sims ?? 300;
  const toReview = recs.slice(-maxReview);

  // 1) 저비용 기록 기반 통계
  const hs = heroStats(recs);
  const model: Record<string, Stats> = {};
  recs.forEach((r) => updateModel(model, r));
  const me = model[heroId];
  const pf = (k: keyof Stats, d: keyof Stats) => (me && (me[d] as number) > 0 ? (me[k] as number) / (me[d] as number) : null);

  // 포지션별 VPIP
  const posAgg: Record<string, { hands: number; vpip: number }> = {};
  recs.forEach((r) => {
    const seat = r.startStacks.find((s) => s.id === heroId)!.seat;
    const label = positionLabels(replayRecord(r, 0))[seat];
    if (!label) return;
    const first = r.events.find((e) => e.seat === seat && e.street === 'preflop' && e.type !== 'sb' && e.type !== 'bb' && e.type !== 'ante');
    const a = (posAgg[label] ??= { hands: 0, vpip: 0 });
    a.hands++;
    if (first && (first.type === 'call' || first.type === 'raise' || first.type === 'bet')) a.vpip++;
  });
  const preflop = Object.entries(posAgg).map(([pos, a]) => {
    const range = POS_RANGE[pos];
    const v = a.vpip / a.hands;
    const verdict: 'tight' | 'ok' | 'loose' | 'n/a' = !range || a.hands < 12 ? 'n/a' : v < range[0] ? 'tight' : v > range[1] ? 'loose' : 'ok';
    return { pos, hands: a.hands, vpip: v, range: (range ?? [0, 1]) as [number, number], verdict };
  }).sort((a, b) => b.hands - a.hands);

  // 2) 운 보정(올인 EV)
  const rng = createRng(777);
  let luckHands = 0, actualBB = 0, expectedBB = 0;
  const cumA: number[] = [], cumJ: number[] = [];
  let ca = 0, cj = 0;
  recs.forEach((r) => {
    const seat = r.startStacks.find((s) => s.id === heroId)!.seat;
    const l = allInLuck(r, seat, rng, 1200);
    const net = (r.result?.net[seat] ?? 0) / r.config.bb;
    ca += net; cj += l.applicable ? l.expected / r.config.bb : net;
    cumA.push(ca); cumJ.push(cj);
    if (l.applicable) { luckHands++; actualBB += l.actual / r.config.bb; expectedBB += l.expected / r.config.bb; }
  });

  // 3) 틸트: 큰 손실 후 5핸드의 VPIP
  const seq = recs.map((r) => {
    const seat = r.startStacks.find((s) => s.id === heroId)!.seat;
    const first = r.events.find((e) => e.seat === seat && e.street === 'preflop' && e.type !== 'sb' && e.type !== 'bb' && e.type !== 'ante');
    return { netBB: (r.result?.net[seat] ?? 0) / r.config.bb, vpip: !!first && ['call', 'raise', 'bet'].includes(first.type) };
  });
  const post: boolean[] = [], base: boolean[] = [];
  let triggers = 0; const inPost = new Set<number>();
  seq.forEach((h, i) => { if (h.netBB <= -20) { triggers++; for (let k = 1; k <= 5 && i + k < seq.length; k++) inPost.add(i + k); } });
  seq.forEach((h, i) => (inPost.has(i) ? post : base).push(h.vpip));
  const vpipAfter = post.length ? mean(post.map(Number)) : null, vpipBase = base.length ? mean(base.map(Number)) : null;
  let tiltVerdict = '표본 부족 (큰 손실 이후 데이터가 더 필요합니다)';
  if (triggers >= 2 && post.length >= 8 && vpipAfter !== null && vpipBase !== null) {
    const d = vpipAfter - vpipBase;
    tiltVerdict = d >= 0.12 ? `큰 손실 뒤 참여율이 ${Math.round(d * 100)}%p 올라갑니다 — 틸트 징후` : d <= -0.12 ? `큰 손실 뒤 오히려 ${Math.round(-d * 100)}%p 위축됩니다 — 소심해지는 경향` : '큰 손실 뒤에도 플레이가 안정적입니다';
  }

  // 4) 결정 단위 복기 (MC) — 청크로 나눠 UI 양보
  const reviews: { rec: HandRecord; rv: HandReview }[] = [];
  for (let i = 0; i < toReview.length; i++) {
    reviews.push({ rec: toReview[i], rv: reviewHand(toReview[i], heroId, sims) });
    if (i % 4 === 3) { opts.onProgress?.((i + 1) / toReview.length); await new Promise((r) => setTimeout(r, 0)); }
  }
  opts.onProgress?.(1);
  const decs = reviews.flatMap((x) => x.rv.decisions.map((d) => ({ ...d, bb: x.rec.config.bb })));
  const scored = decs.filter((d) => d.score !== null);
  const gradeDist: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  scored.forEach((d) => { if (d.grade) gradeDist[d.grade]++; });
  const by = <K extends string>(key: (d: typeof scored[number]) => K) => {
    const m = new Map<K, number[]>(); scored.forEach((d) => { const k = key(d); m.set(k, [...(m.get(k) ?? []), d.score!]); }); return m;
  };
  const scoreByStreet = ['preflop', 'flop', 'turn', 'river'].map((s) => ({ street: s, avg: mean(by((d) => d.street as string).get(s) ?? []), n: (by((d) => d.street as string).get(s) ?? []).length })).filter((x) => x.n > 0);
  const posScore = by((d) => d.position as string);
  const scoreByPosition = [...posScore.entries()].map(([pos, arr]) => {
    const p = hs.byPos.find((x) => x.label === pos);
    return { pos, avg: mean(arr), n: arr.length, netBB100: p ? p.bb100 : null, hands: p?.hands ?? 0 };
  }).sort((a, b) => b.n - a.n);
  const evLossBB = decs.reduce((t, d) => t + d.evLossBB, 0);
  const mm = new Map<string, { count: number; ev: number }>();
  decs.forEach((d) => { if (d.mistake) { const k = d.mistake.replace('(추정)', ''); const e = mm.get(k) ?? { count: 0, ev: 0 }; e.count++; e.ev += d.evLossBB; mm.set(k, e); } });
  const mistakes = [...mm.entries()].map(([type, v]) => ({ type, count: v.count, evLossBB: v.ev })).sort((a, b) => b.evLossBB - a.evLossBB || b.count - a.count);

  // 5) 누수 진단
  const leaks: Leak[] = [];
  const facingPost = decs.filter((d) => d.facingBet && d.street !== 'preflop' && (d.actionType === 'fold' || d.actionType === 'call'));
  const cnt = (type: string) => mm.get(type)?.count ?? 0;
  const ev = (type: string) => mm.get(type)?.ev ?? 0;
  const sev = (n: number, lo: number, hi: number): 1 | 2 | 3 => (n >= hi ? 3 : n >= lo ? 2 : 1);
  if (cnt('과폴드') >= 3 || (facingPost.length >= 12 && cnt('과폴드') / facingPost.length >= 0.2)) {
    leaks.push({ id: 'overfold', title: '이길 만한 핸드를 너무 쉽게 접습니다', severity: sev(cnt('과폴드'), 5, 10), evidence: `포스트플랍 벳 직면 ${facingPost.length}회 중 팟오즈상 콜이 유리했던 폴드 ${cnt('과폴드')}회 (추정 손실 ${ev('과폴드').toFixed(1)}BB)`, advice: '벳을 맞으면 먼저 "콜 금액 ÷ (팟+콜 금액)"을 계산하세요. 팟의 ⅓ 벳은 25%, ½ 벳은 33%, 팟 벳은 50% 승률만 있으면 콜이 맞습니다. 상대가 블러프할 수 있다는 가능성도 함께 넣으세요.', evLossBB: ev('과폴드'), drill: 'spot' });
  }
  if (cnt('과콜') >= 3 || (facingPost.length >= 12 && cnt('과콜') / facingPost.length >= 0.2)) {
    leaks.push({ id: 'overcall', title: '승률이 모자란데 호기심으로 콜합니다', severity: sev(cnt('과콜'), 5, 10), evidence: `팟오즈에 못 미친 콜 ${cnt('과콜')}회 (추정 손실 ${ev('과콜').toFixed(1)}BB)`, advice: '"혹시 블러프일지도"로 콜하기 전에 상대 레인지에서 내가 이기는 핸드가 얼마나 되는지 떠올리세요. 큰 벳일수록 필요한 승률이 올라갑니다. 드로우가 아니면 접는 것이 기본입니다.', evLossBB: ev('과콜'), drill: 'spot' });
  }
  if (cnt('범위 밖 오픈') >= 4) leaks.push({ id: 'wide-open', title: '포지션에 비해 약한 핸드로 오픈합니다', severity: sev(cnt('범위 밖 오픈'), 6, 12), evidence: `기준 범위를 크게 벗어난 오픈 ${cnt('범위 밖 오픈')}회`, advice: '앞 포지션일수록 오픈 범위를 좁히세요. UTG는 상위 14% 안팎(77+, AJ+, KQ 정도), 버튼은 상위 45%까지 넓힐 수 있습니다.', evLossBB: 0 });
  if (cnt('림프') >= 4) leaks.push({ id: 'limp', title: '림프가 잦습니다', severity: sev(cnt('림프'), 6, 12), evidence: `레이즈 없는 팟에서 림프 ${cnt('림프')}회`, advice: '참여하려면 레이즈(보통 2.5BB), 아니면 폴드입니다. 림프는 포지션과 주도권을 모두 내줍니다.', evLossBB: 0 });
  const riverBigCalls = decs.filter((d) => d.street === 'river' && d.actionType === 'call' && (d.facedFracOfPot ?? 0) >= 0.7 && d.mistake?.startsWith('과콜')).length;
  if (riverBigCalls >= 2) leaks.push({ id: 'river-call', title: '리버 큰 벳을 너무 자주 콜합니다', severity: sev(riverBigCalls, 2, 4), evidence: `리버에서 팟의 70% 이상 벳에 승률 부족 콜 ${riverBigCalls}회`, advice: '리버의 큰 벳은 보통 가장 강한 핸드 위주입니다. 원페어 이하는 접는 것이 평균적으로 이득입니다.', evLossBB: 0, drill: 'spot' });
  if (cnt('밸류 기회 놓침') >= 3) leaks.push({ id: 'missed-value', title: '강한 핸드로 체크해 가치를 놓칩니다', severity: sev(cnt('밸류 기회 놓침'), 4, 8), evidence: `승률 70%+ 핸드 체크 ${cnt('밸류 기회 놓침')}회`, advice: '강한 핸드는 팟의 50~75%로 먼저 벳하세요. 상대가 콜할 수 있는 약한 핸드를 가진 쪽이 대부분입니다.', evLossBB: 0 });
  if (cnt('과대 베팅') >= 2) leaks.push({ id: 'oversize', title: '약한 핸드로 너무 크게 베팅합니다', severity: 2, evidence: `승률 40% 미만 핸드로 팟 초과 베팅 ${cnt('과대 베팅')}회`, advice: '블러프는 팟의 ⅓~⅔로 충분합니다. 크기가 클수록 필요한 폴드율이 올라갑니다.', evLossBB: 0 });
  const vpip = hs.metrics.find((m) => m.key === 'vpip'), pfr = hs.metrics.find((m) => m.key === 'pfr');
  if (vpip?.pct != null && pfr?.pct != null && hs.hands >= 30) {
    if (vpip.pct - pfr.pct > 12) leaks.push({ id: 'passive-pre', title: '프리플랍에서 콜/림프 위주입니다', severity: vpip.pct - pfr.pct > 20 ? 3 : 2, evidence: `VPIP ${vpip.pct.toFixed(0)}% vs PFR ${pfr.pct.toFixed(0)}% (격차 ${(vpip.pct - pfr.pct).toFixed(0)}%p, ${hs.hands}핸드)`, advice: '참여할 핸드는 콜보다 레이즈로 시작하세요. 주도권을 잡으면 상대가 접어서 이기는 길이 하나 더 생깁니다.', evLossBB: 0 });
    if (vpip.pct < 14 && hs.hands >= 40) leaks.push({ id: 'too-tight', title: '너무 타이트해서 블라인드에 계속 깎입니다', severity: 2, evidence: `VPIP ${vpip.pct.toFixed(0)}% (${hs.hands}핸드)`, advice: '버튼·컷오프에서 오픈 범위를 넓히세요. 포지션이 좋을수록 더 많은 핸드를 플레이할 수 있습니다.', evLossBB: 0 });
    if (vpip.pct > 40 && hs.hands >= 40) leaks.push({ id: 'too-loose', title: '너무 많은 핸드에 참여합니다', severity: 2, evidence: `VPIP ${vpip.pct.toFixed(0)}% (${hs.hands}핸드)`, advice: '앞 포지션에서는 상위 15~20% 핸드만 시작하세요. 약한 핸드로 어려운 팟에 들어가는 것이 가장 큰 손실 원인입니다.', evLossBB: 0 });
  }
  preflop.filter((p) => p.hands >= 15 && (p.pos === 'BTN' || p.pos === 'CO') && p.verdict === 'tight').forEach((p) => leaks.push({ id: 'steal-' + p.pos, title: `${p.pos}에서 참여가 너무 적습니다 (스틸 부족)`, severity: 2, evidence: `${p.pos} VPIP ${(p.vpip * 100).toFixed(0)}% (권장 ${(p.range[0] * 100).toFixed(0)}~${(p.range[1] * 100).toFixed(0)}%, ${p.hands}핸드)`, advice: '앞이 모두 접었다면 이 자리에서는 하위 핸드도 많이 레이즈해 블라인드를 훔쳐야 합니다. 포지션은 가장 큰 무기입니다.', evLossBB: 0 }));
  const tb = hs.metrics.find((m) => m.key === '3bet'), f3 = hs.metrics.find((m) => m.key === 'f3b'), cb = hs.metrics.find((m) => m.key === 'cbet'), fcb = hs.metrics.find((m) => m.key === 'fcb'), af = hs.metrics.find((m) => m.key === 'af'), wsd = hs.metrics.find((m) => m.key === 'wsd');
  if (tb && tb.den >= 20 && tb.pct! < 3) leaks.push({ id: '3bet-low', title: '3벳이 거의 없어 예측 가능합니다', severity: 1, evidence: `3벳 ${tb.num}/${tb.den} (${tb.pct!.toFixed(1)}%)`, advice: '강한 핸드(AA-JJ, AK)와 일부 블러프(A5s 류)로 3벳 빈도를 4~7%까지 올려 보세요.', evLossBB: 0 });
  if (f3 && f3.den >= 8 && f3.pct! > 70) leaks.push({ id: 'fold-3bet', title: '3벳을 맞으면 거의 접습니다', severity: 2, evidence: `3벳에 폴드 ${f3.num}/${f3.den} (${f3.pct!.toFixed(0)}%)`, advice: '상대가 이를 눈치채면 3벳만으로 당신의 오픈을 계속 이길 수 있습니다. 중간 강도 핸드는 콜, 일부는 4벳으로 맞서세요.', evLossBB: 0 });
  if (cb && cb.den >= 10 && cb.pct! < 40) leaks.push({ id: 'cbet-low', title: '프리플랍 주도권을 플랍에서 놓습니다', severity: 1, evidence: `C-bet ${cb.num}/${cb.den} (${cb.pct!.toFixed(0)}%)`, advice: '드라이한 보드에서는 작은 사이즈로 자주 C-bet해 팟을 가져오세요.', evLossBB: 0 });
  if (fcb && fcb.den >= 8 && fcb.pct! > 65) leaks.push({ id: 'fold-cbet', title: 'C-bet에 너무 자주 접습니다', severity: 2, evidence: `C-bet에 폴드 ${fcb.num}/${fcb.den} (${fcb.pct!.toFixed(0)}%)`, advice: '상대 C-bet은 보드를 맞추지 못한 경우가 많습니다. 페어/드로우가 있으면 콜 또는 레이즈로 되받아치세요.', evLossBB: 0 });
  if (af && af.den >= 30 && af.pct! < 35) leaks.push({ id: 'passive-post', title: '포스트플랍이 수동적입니다', severity: 2, evidence: `벳·레이즈 비율 ${af.pct!.toFixed(0)}% (${af.den}회)`, advice: '콜만 하면 이기는 길이 한 가지뿐입니다. 벳/레이즈는 폴드로 이기는 길도 만듭니다.', evLossBB: 0 });
  if (wsd && wsd.den >= 10 && wsd.pct! < 45) leaks.push({ id: 'wsd-low', title: '쇼다운에서 지는 일이 많습니다', severity: 2, evidence: `W$SD ${wsd.num}/${wsd.den} (${wsd.pct!.toFixed(0)}%)`, advice: '쇼다운까지 가는 핸드가 약하다는 신호입니다. 중간 핸드의 콜다운을 줄이세요.', evLossBB: 0 });
  if (tiltVerdict.includes('틸트')) leaks.push({ id: 'tilt', title: '큰 손실 뒤 플레이가 흐트러집니다', severity: 3, evidence: tiltVerdict, advice: '20BB 이상 잃으면 다음 5핸드는 "프리미엄만"으로 제한하거나 1분 쉬세요. 감정 손실을 칩으로 되찾으려 하면 더 크게 잃습니다.', evLossBB: 0 });
  leaks.sort((a, b) => b.severity - a.severity || b.evLossBB - a.evLossBB);

  const strengths: string[] = [];
  const avgScore = scored.length ? mean(scored.map((d) => d.score!)) : null;
  if (avgScore !== null && avgScore >= 85) strengths.push(`판단 정확도가 높습니다 (평균 ${avgScore.toFixed(0)}점, 근사)`);
  if (facingPost.length >= 10 && cnt('과폴드') + cnt('과콜') <= Math.max(1, facingPost.length * 0.08)) strengths.push('팟오즈에 맞는 콜/폴드를 안정적으로 합니다');
  preflop.filter((p) => p.hands >= 15 && p.verdict === 'ok').forEach((p) => strengths.push(`${p.pos} 참여 범위가 적정합니다 (VPIP ${(p.vpip * 100).toFixed(0)}%)`));
  if (tiltVerdict.includes('안정')) strengths.push('큰 손실 뒤에도 흔들리지 않습니다');
  if (luckHands >= 3 && expectedBB - 0 > 0 && actualBB < expectedBB - 5) strengths.push('올인 승률은 유리하게 쌓고 있습니다(결과는 운이 나빴을 뿐)');

  // 6) 상대별
  const meta = new Map(players.map((p) => [p.id, p]));
  const opponents: OpponentReport[] = [];
  const ids = [...new Set(recs.flatMap((r) => r.startStacks.map((s) => s.id)))].filter((i) => i !== heroId);
  for (const id of ids) {
    let hands = 0, netBB = 0;
    recs.forEach((r) => {
      const o = r.startStacks.find((s) => s.id === id)?.seat; const h = r.startStacks.find((s) => s.id === heroId)!.seat;
      if (o === undefined) return;
      const inv = (seat: number) => r.events.some((e) => e.seat === seat && e.street === 'preflop' && (e.type === 'call' || e.type === 'raise' || e.type === 'bet'));
      const bothIn = inv(h) && inv(o);
      const hu = r.startStacks.filter((s) => s.stack > 0).length === 2;
      if (bothIn || hu) { hands++; netBB += (r.result?.net[h] ?? 0) / r.config.bb; }
    });
    const st = model[id]; const m = meta.get(id);
    if (!st || hands === 0) continue;
    opponents.push({ id, name: m?.name ?? id, hands, netBB, vpip: st.hands ? estimate.vpip(st) : null, pfr: st.hands ? estimate.pfr(st) : null, af: estimate.aggFreq(st), sample: st.hands, advice: ARCHETYPE_ADVICE[m?.profileId ?? ''] ?? '표본이 쌓이면 성향 분석이 정교해집니다.' });
  }
  opponents.sort((a, b) => b.hands - a.hands);

  // 7) 추이와 계획
  const trend = chunk(reviews, Math.max(5, Math.ceil(reviews.length / 6))).map((grp, i) => {
    const sc = grp.flatMap((x) => x.rv.decisions.filter((d) => d.score !== null).map((d) => d.score!));
    return { label: `${i + 1}구간`, score: mean(sc) };
  }).filter((t) => t.score > 0);
  const top = leaks.slice(0, 3);
  const plan = top.map((l) => ({ title: l.title, steps: [l.advice, `다음 50핸드 동안 이 항목만 의식적으로 점검하세요. (측정: 분석실에서 "${l.id}" 항목의 횟수 변화 확인)`], drill: l.drill }));
  if (!plan.length) plan.push({ title: '현재는 큰 누수가 보이지 않습니다', steps: ['표본을 더 쌓으면서 3벳/C-bet 같은 빈도 지표를 점검하세요.', '난이도를 한 단계 올려 새로운 약점을 찾아보세요.'], drill: undefined });

  const luckBB = actualBB - expectedBB;
  const summary = `${recs.length}핸드, ${hs.net >= 0 ? '+' : ''}${hs.net.toLocaleString()}칩${hs.bb100 !== null ? ` (${hs.bb100.toFixed(1)} BB/100)` : ''}. ${avgScore !== null ? `판단 점수 평균 ${avgScore.toFixed(0)}점(근사). ` : ''}${leaks[0] ? `가장 큰 개선점: ${leaks[0].title}.` : '뚜렷한 누수는 아직 보이지 않습니다.'}${luckHands >= 3 ? ` 올인 운 보정: ${luckBB >= 0 ? '+' : ''}${luckBB.toFixed(1)}BB.` : ''}`;

  return {
    totalHands: recs.length, analyzedHands: toReview.length, decisions: decs.length, net: hs.net, bb100: hs.bb100, avgScore, gradeDist, scoreByStreet, scoreByPosition,
    evLossBB, evLossPer100: toReview.length ? (evLossBB / toReview.length) * 100 : null, mistakes, leaks, strengths, preflop,
    luck: { hands: luckHands, actualBB, expectedBB, luckBB }, series: { actual: cumA, adjusted: cumJ },
    tilt: { triggers, postHands: post.length, vpipAfter, vpipBase, verdict: tiltVerdict }, trend, opponents, plan, summary,
  };
}
void categoryOf; void cardToString;
