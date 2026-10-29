/**
 * 단계형 이벤트: 헤즈업 토너먼트표(브래킷)와 슛아웃(테이블 승자 1명 진출).
 * 내가 앉은 매치는 풀 엔진(SNG/헤즈업)으로 진행하고, 같은 라운드의 다른 매치는 배치 시뮬레이터로 결과를 정한다.
 * 라운드마다 칩은 새로 시작한다(실제 브래킷/슛아웃 방식). 순위는 라운드 단위 동순위 묶음으로 정해진다.
 */
import { createRng, RNG } from '../engine/rng';
import { AISetup, Difficulty } from '../ai/profiles';
import { beginHand, newSession, Session, SessionConfig, HANDS_PER_LEVEL } from './session';
import { simulateBatch } from '../world/batch';
import { fromTuple, skillFromSetup, SkillTuple } from '../world/fastTable';
import { shootoutLayout, prizeStructure } from '../world/prizes';
import { templateById } from '../world/calendar';
import type { Opponent } from './mtt';

export interface StagedState {
  kind: 'hu' | 'shootout';
  eventId: string;
  tableSize: number;
  /** 나를 제외한 전원의 정보 */
  field: Record<string, { name: string; profileId: string; difficulty: number; skill?: SkillTuple }>;
  alive: string[];            // 이번 라운드 시작 시 생존자 (영웅 'hero' 포함)
  tables: string[][];         // 이번 라운드의 테이블 구성 (영웅 테이블 포함)
  entries: number;
  round: number;              // 1부터
  final: boolean;             // 이번 매치가 결승(또는 결승 테이블)
  /** 이번 매치를 이겨서 다음 라운드 대기 중 */
  advance: boolean;
  heroPlace?: number;
  finished: boolean;
  seed: number;
  log: string[];
}

const hpl = (s: Session) => HANDS_PER_LEVEL[s.config.speed];

/** 영웅 테이블과 나머지 테이블을 나눈다 (결정론: rng) */
function partition(alive: string[], tableSize: number, rng: RNG): string[][] {
  const others = alive.filter((x) => x !== 'hero');
  for (let i = others.length - 1; i > 0; i--) { const j = rng.int(i + 1); [others[i], others[j]] = [others[j], others[i]]; }
  const tables: string[][] = [['hero', ...others.splice(0, tableSize - 1)]];
  while (others.length) tables.push(others.splice(0, tableSize));
  return tables;
}

function matchSession(prev: Session | null, st: StagedState, base: { startBB: number; bb: number; speed: Session['config']['speed']; humanName: string; seed: number; tierId?: string }): Session {
  const mine = st.tables[0];
  const opps = mine.filter((x) => x !== 'hero');
  const ais: AISetup[] = opps.map((id) => ({ profileId: st.field[id].profileId, difficulty: st.field[id].difficulty as Difficulty }));
  const cfg: SessionConfig = {
    mode: mine.length === 2 ? 'headsup-sng' : 'sng', seats: mine.length, startBB: base.startBB, bb: base.bb, speed: base.speed, humanName: base.humanName, seed: base.seed,
    ais, aiNames: opps.map((id) => st.field[id].name), aiIds: opps, blindMode: 'regular', tierId: base.tierId,
  };
  let s = newSession(cfg);
  if (prev) s = { ...s, memory: prev.memory, records: prev.records, feed: prev.feed, sid: prev.sid, instanceId: prev.instanceId, prize: prev.prize, tierId: prev.tierId, tourneyRecorded: prev.tourneyRecorded, config: { ...s.config, tierId: prev.tierId } };
  return { ...s, staged: st };
}

export interface StagedLaunch { eventId: string; seed: number; opponents: Opponent[]; humanName: string; tierId: string; sid: string; memory: Session['memory'] }
export function newStagedSession(l: StagedLaunch): Session {
  const ev = templateById(l.eventId);
  const rng = createRng(l.seed ^ 0x57a9ed);
  const field: StagedState['field'] = {};
  for (const o of l.opponents) field[o.id] = { name: o.name, profileId: o.profileId, difficulty: o.difficulty, skill: o.skill };
  const alive = ['hero', ...l.opponents.map((o) => o.id)];
  const tableSize = ev.kind === 'hu' ? 2 : ev.tableSize;
  const lay = ev.kind === 'shootout' ? shootoutLayout(alive.length, tableSize) : null;
  const final = ev.kind === 'hu' ? alive.length === 2 : alive.length <= tableSize;
  const st: StagedState = {
    kind: ev.kind as 'hu' | 'shootout', eventId: l.eventId, tableSize, field, alive, tables: final ? [['hero', ...alive.filter((x) => x !== 'hero')]] : partition(alive, tableSize, rng), entries: alive.length,
    round: 1, final, advance: false, finished: false, seed: l.seed, log: [`라운드 1 시작 — ${alive.length}명`],
  };
  void lay;
  const ps = prizeStructure(ev, alive.length);
  let s = matchSession(null, st, { startBB: ev.stackBB, bb: ev.bb0, speed: ev.speed, humanName: l.humanName, seed: l.seed, tierId: l.tierId });
  s = { ...s, sid: l.sid, tierId: l.tierId, memory: structuredClone(l.memory), prize: { pool: ps.prizePool, payouts: ps.payouts, buyIn: ev.buyIn, fee: Math.round(ev.buyIn * ev.feePct), name: ev.name }, config: { ...s.config, tierId: l.tierId } };
  return beginHand(s, createRng(l.seed ^ 0x51ed270b));
}

/** 이 라운드에서 탈락했을 때의 순위(동순위 묶음의 첫 순위) */
export function placeOnElimination(st: StagedState, heroFinishPlaceInFinalTable?: number): number {
  if (st.final && heroFinishPlaceInFinalTable !== undefined) return heroFinishPlaceInFinalTable;
  if (st.kind === 'hu') return st.entries / Math.pow(2, st.round) + 1;
  const { finalSize, eliminated } = shootoutLayout(st.entries, st.tableSize);
  let start = finalSize + 1;
  for (let r = eliminated.length; r > st.round; r--) start += eliminated[r - 1];
  return start;
}

/** 한 핸드가 끝난 뒤 호출: 영웅 탈락/우승/매치 승리를 반영한다. 변화가 없으면 같은 객체를 돌려준다. */
export function stagedAfterHand(s: Session): Session {
  const st = s.staged;
  if (!st || st.finished || st.advance || s.game.street !== 'complete') return s;
  const hero = s.game.players.find((p) => p.isHuman)!;
  const heroBusted = hero.busted || hero.stack === 0;
  const alive = s.game.players.filter((p) => !p.busted && p.stack > 0).length;
  if (heroBusted) {
    const finish = st.final ? hero.finishPlace : undefined;
    const place = placeOnElimination(st, finish);
    return { ...s, staged: { ...st, heroPlace: place, finished: true, log: [...st.log, `라운드 ${st.round}에서 탈락 — ${place}위${st.kind === 'hu' || !st.final ? ' (동순위 묶음의 첫 순위)' : ''}`] } };
  }
  if (alive <= 1 || s.game.gameOver) {
    if (st.final) return { ...s, staged: { ...st, heroPlace: 1, finished: true, log: [...st.log, '결승 우승'] } };
    return { ...s, staged: { ...st, advance: true, log: [...st.log, `라운드 ${st.round} 승리`] } };
  }
  return s;
}

/** 매치 승리 후: 다른 테이블 결과를 배치 시뮬레이터로 정하고 다음 라운드 매치를 만든다 */
export function startNextRound(s: Session, rng: RNG): Session {
  const st = s.staged;
  if (!st || !st.advance) throw new Error('다음 라운드로 갈 수 없습니다');
  const ev = templateById(st.eventId);
  const startStack = ev.stackBB * ev.bb0;
  const winners: string[] = ['hero'];
  let seed = (st.seed ^ Math.imul(st.round, 2654435761)) >>> 0;
  for (const tb of st.tables.slice(1)) {
    if (tb.length === 1) { winners.push(tb[0]); continue; }
    const ents = tb.map((id) => { const f = st.field[id]; return { id, skill: f.skill ? fromTuple(f.skill) : skillFromSetup(f.profileId, f.difficulty) }; });
    const r = simulateBatch({ entrants: ents, startStack, bb0: ev.bb0, tableSize: tb.length, handsPerLevel: hpl(s), paidPlaces: 1, seed: seed++ });
    winners.push(r.order[0].pid);
  }
  const round = st.round + 1;
  const final = st.kind === 'hu' ? winners.length === 2 : winners.length <= st.tableSize;
  const next: StagedState = {
    ...st, alive: winners, round, advance: false, final, tables: final ? [['hero', ...winners.filter((x) => x !== 'hero')]] : partition(winners, st.tableSize, rng),
    log: [...st.log, `라운드 ${round} 시작 — 생존 ${winners.length}명${final ? ' (결승)' : ''}`],
  };
  const seedNext = (st.seed + round * 7919) >>> 0;
  let n = matchSession(s, next, { startBB: ev.stackBB, bb: ev.bb0, speed: ev.speed, humanName: s.config.humanName, seed: seedNext, tierId: s.tierId });
  n = { ...n, aiBySeat: n.aiBySeat };
  return beginHand(n, createRng(seedNext ^ 0x51ed270b));
}
