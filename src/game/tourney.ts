import { icm, payoutStructure, sngPayouts } from './icm';
import { blindStructure, HANDS_PER_LEVEL, LEVEL_COUNT, Session } from './session';

export type StackZone = 'comfortable' | 'pressure' | 'danger' | 'shove';

export interface Standing { id: string; name: string; chips: number; isHero: boolean; table: number }
export interface TourneyStatus {
  kind: 'sng' | 'mtt';
  entrants: number;             // 총 엔트리(재진입·레이트 등록 포함)
  totalEntries: number;
  playersLeft: number;
  eliminated: number;
  paidPlaces: number;
  toMoney: number;              // 입상까지 탈락해야 하는 인원 (≤0 이면 이미 입상)
  inTheMoney: boolean;
  bubble: boolean;              // 정확히 버블 (남은 인원 = 입상 인원 + 1)
  nearBubble: boolean;          // 버블 접근 (입상 인원 + 1 ~ +3)
  finalTable: boolean;
  totalChips: number;
  avgStack: number;
  heroChips: number;
  heroRank: number;             // 1 = 칩리더
  heroVsAvg: number;            // 평균 대비 배수
  leader: Standing;
  top: Standing[];              // 상위 5명 (+ 나)
  level: number;                // 1부터
  sb: number; bb: number; ante: number;
  next: { sb: number; bb: number; ante: number } | null;
  handsToNext: number;
  heroBB: number;               // 스택(BB 단위)
  avgBB: number;
  M: number;                    // 스택 / (SB+BB+앤티×인원) — 한 바퀴 비용 대비 생존 라운드 수
  zone: StackZone;
  payouts: number[];
  prizePool: number;
  heroPrizeNow: number;         // 지금 탈락하면 받는 상금
  nextJump: number;             // 한 명 더 탈락하면 늘어나는 내 보장 상금
  icmEquity: number | null;     // 내 ICM 기대 상금 (남은 인원 ≤ 9)
  icmShare: number | null;
  chipShare: number;
  recentElims: { name: string; place: number }[];
  stage: Stage;
  stageIndex: number;
  registrationOpen: boolean;
  lateJoined: number;
  firstPrize: number;
}

export type Stage = 'early' | 'middle' | 'bubble' | 'money' | 'final' | 'headsup';
export const STAGES: { id: Stage; label: string }[] = [
  { id: 'early', label: '초반' }, { id: 'middle', label: '중반' }, { id: 'bubble', label: '버블' }, { id: 'money', label: '입상권' }, { id: 'final', label: '파이널' }, { id: 'headsup', label: '헤즈업' },
];

export const zoneOf = (m: number): StackZone => (m >= 20 ? 'comfortable' : m >= 10 ? 'pressure' : m >= 6 ? 'danger' : 'shove');
export const ZONE_LABEL: Record<StackZone, string> = { comfortable: '안정', pressure: '압박', danger: '위험', shove: '올인 구간' };

export function isTournament(sess: Session): boolean {
  return sess.config.mode === 'sng' || sess.config.mode === 'headsup-sng' || sess.config.mode === 'mtt';
}

export function tourneyStatus(sess: Session): TourneyStatus | null {
  if (!isTournament(sess)) return null;
  const g = sess.game;
  const mtt = sess.mtt;
  const live = g.street !== 'complete';
  const chipsOf = (p: { stack: number; invested: number }) => p.stack + (live ? p.invested : 0);

  const standings: Standing[] = [];
  const names = mtt?.names ?? {};
  if (mtt) {
    for (const t of mtt.tables) {
      const game = t.id === mtt.heroTable ? g : t.game;
      game.players.forEach((p) => { if (!p.busted && (p.stack > 0 || (live && p.invested > 0))) standings.push({ id: p.id, name: names[p.id] ?? p.name, chips: chipsOf(p), isHero: p.isHuman, table: t.id }); });
    }
  } else {
    g.players.forEach((p) => { if (!p.busted && (p.stack > 0 || p.invested > 0)) standings.push({ id: p.id, name: p.name, chips: chipsOf(p), isHero: p.isHuman, table: 0 }); });
  }
  standings.sort((a, b) => b.chips - a.chips);
  const playersLeft = standings.length;
  const totalChips = standings.reduce((t, s) => t + s.chips, 0);
  const avgStack = playersLeft ? totalChips / playersLeft : 0;
  const hero = standings.find((s) => s.isHero);
  const heroChips = hero?.chips ?? 0;
  const heroRank = hero ? standings.indexOf(hero) + 1 : playersLeft + 1;

  const entrants = mtt ? mtt.totalEntries : g.players.length;
  const payouts = mtt ? mtt.payouts : sngPayouts(g.players.length, 100);
  const prizePool = mtt ? mtt.prizePool : 100 * g.players.length;
  const paidPlaces = payouts.length;
  const toMoney = playersLeft - paidPlaces;

  const structure = blindStructure(sess.config.bb);
  const lvl = mtt ? sess.level : sess.level;
  const cur = structure[Math.min(lvl, structure.length - 1)];
  const nxt = lvl + 1 < structure.length ? structure[lvl + 1] : null;
  const hpl = HANDS_PER_LEVEL[sess.config.speed];
  const handsToNext = mtt ? hpl - (mtt.round % hpl) : hpl - sess.levelHand;
  const heroTableSize = g.players.filter((p) => !p.busted && (p.stack > 0 || p.invested > 0)).length || 1;
  const orbit = cur.sb + cur.bb + cur.ante * heroTableSize;
  const M = heroChips / Math.max(1, orbit);

  const heroPrizeNow = playersLeft <= paidPlaces ? payouts[playersLeft - 1] ?? 0 : 0; // 지금 탈락 시 순위 = 남은 인원
  const nextJump = playersLeft - 1 >= 1 && playersLeft - 1 <= paidPlaces ? (payouts[playersLeft - 2] ?? 0) - (payouts[playersLeft - 1] ?? 0) : 0;
  let icmEquity: number | null = null;
  if (playersLeft <= 9 && playersLeft >= 2 && hero) {
    const e = icm(standings.map((s) => s.chips), payouts);
    icmEquity = e[standings.indexOf(hero)];
  }
  const elimsRaw = mtt ? mtt.elims.slice(-4).map((e) => ({ name: e.name, place: e.place }))
    : g.players.filter((p) => p.finishPlace !== undefined && p.busted && p.finishPlace > 1).sort((a, b) => (a.finishPlace ?? 0) - (b.finishPlace ?? 0)).slice(0, 4).map((p) => ({ name: p.name, place: p.finishPlace! }));
  const top = standings.slice(0, 5);
  if (hero && !top.includes(hero)) top.push(hero);
  const progress = entrants ? 1 - playersLeft / entrants : 0;
  const finalTable = mtt ? mtt.tables.length === 1 && entrants > mtt.config.tableSize : false;
  const stage: Stage = playersLeft <= 2 ? 'headsup' : finalTable && toMoney <= 0 ? 'final' : toMoney <= 0 ? 'money' : toMoney <= 3 ? 'bubble' : progress >= 0.25 ? 'middle' : 'early';
  return {
    totalEntries: entrants, stage, stageIndex: STAGES.findIndex((s) => s.id === stage), registrationOpen: mtt?.registrationOpen ?? false, lateJoined: mtt?.lateJoined ?? 0, firstPrize: payouts[0] ?? 0,
    kind: mtt ? 'mtt' : 'sng', entrants, playersLeft, eliminated: Math.max(0, entrants - playersLeft), paidPlaces, toMoney,
    inTheMoney: toMoney <= 0, bubble: toMoney === 1, nearBubble: toMoney >= 1 && toMoney <= 3,
    finalTable: mtt ? mtt.tables.length === 1 && entrants > mtt.config.tableSize : false,
    totalChips, avgStack, heroChips, heroRank, heroVsAvg: avgStack ? heroChips / avgStack : 0, leader: standings[0] ?? { id: '', name: '-', chips: 0, isHero: false, table: 0 }, top,
    level: lvl + 1, sb: cur.sb, bb: cur.bb, ante: cur.ante, next: nxt, handsToNext, heroBB: heroChips / cur.bb, avgBB: avgStack / cur.bb, M, zone: zoneOf(M),
    payouts, prizePool, heroPrizeNow, nextJump, icmEquity, icmShare: icmEquity !== null ? icmEquity / prizePool : null, chipShare: totalChips ? heroChips / totalChips : 0,
    recentElims: elimsRaw,
  };
}

/** 상태 변화에서 토너먼트 알림(블라인드 상승, 탈락, 버블, 파이널 테이블, 입상, 순위 변동, 위험 구간 진입)을 만든다 */
export function tourneyAnnouncements(prev: TourneyStatus | null, cur: TourneyStatus): string[] {
  const out: string[] = [];
  if (!prev) return out;
  if (cur.level > prev.level) out.push(`블라인드 상승 — 레벨 ${cur.level}: ${cur.sb}/${cur.bb}${cur.ante ? ` 앤티 ${cur.ante}` : ''}. 평균 스택은 ${cur.avgBB.toFixed(0)}BB로 줄었습니다.`);
  const gone = prev.playersLeft - cur.playersLeft;
  if (gone > 0) out.push(`${gone}명 탈락 — 남은 인원 ${cur.playersLeft}명${cur.recentElims.length ? ` (${cur.recentElims.slice(-gone).map((e) => `${e.name} ${e.place}위`).join(', ')})` : ''}.`);
  if (cur.bubble && !prev.bubble) out.push('버블입니다. 한 명만 더 탈락하면 모두 입상 — 짧은 스택의 올인에 큰 스택이 콜 범위를 좁히는 구간입니다.');
  else if (cur.inTheMoney && !prev.inTheMoney) out.push(`입상 확정! 최소 ${cur.payouts[cur.paidPlaces - 1].toLocaleString()} 상금 확보. 이제부터는 순위 상승이 상금을 키웁니다.`);
  if (cur.finalTable && !prev.finalTable) out.push('파이널 테이블 시작. 이제 한 명 탈락할 때마다 상금이 크게 뜁니다.');
  if (cur.totalEntries > prev.totalEntries) out.push(`신규 등록 ${cur.totalEntries - prev.totalEntries}명 입장 — 총 ${cur.totalEntries}엔트리, 남은 인원 ${cur.playersLeft}명, 입상 ${cur.paidPlaces}명.`);
  if (prev.registrationOpen && !cur.registrationOpen) out.push(`등록 마감 — 총 ${cur.totalEntries}엔트리, 상금 풀 ${cur.prizePool.toLocaleString()}, 우승 상금 ${cur.firstPrize.toLocaleString()}.`);
  if (cur.stage !== prev.stage) {
    if (cur.stage === 'middle') out.push(`중반 진입 — 필드의 ${Math.round((1 - cur.playersLeft / cur.totalEntries) * 100)}%가 사라졌습니다. 평균 스택 ${cur.avgBB.toFixed(0)}BB.`);
    else if (cur.stage === 'bubble' && prev.stage !== 'bubble') out.push(`버블 접근 — 입상까지 ${cur.toMoney}명 남았습니다. 중간 스택은 무리한 콜을 줄이고, 큰 스택은 압박할 구간입니다.`);
    else if (cur.stage === 'headsup') out.push('헤즈업 — 우승까지 단 한 명. 버튼은 SB로 먼저 행동합니다.');
  }
  if (cur.heroRank === 1 && prev.heroRank !== 1) out.push('칩리더에 올랐습니다. 압박을 무기로 쓸 때입니다.');
  if (cur.zone !== prev.zone && (cur.zone === 'danger' || cur.zone === 'shove')) out.push(`스택 M=${cur.M.toFixed(1)} — ${ZONE_LABEL[cur.zone]}. 콜/팟 플레이는 어렵습니다. 푸시 아니면 폴드를 기본으로 생각하세요.`);
  else if (cur.zone === 'comfortable' && prev.zone !== 'comfortable') out.push(`스택이 회복되었습니다 (M=${cur.M.toFixed(1)}). 다시 다양한 플레이가 가능합니다.`);
  return out;
}
export { payoutStructure };
