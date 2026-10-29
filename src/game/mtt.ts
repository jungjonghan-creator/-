import { AISetup, Difficulty, PERSONAS, PROFILE_IDS } from '../ai/profiles';
import { pickOpponents, ROSTER } from '../economy/roster';
import { nextLevelLength } from './blinds';
import { aiStep, beginHand, blindStructure, LEVEL_COUNT, HANDS_PER_LEVEL, Session, SessionConfig, Speed } from './session';
import { icm, payoutStructure } from './icm';
import { createGame, makePlayer, startHand } from '../engine/game';
import { createRng, RNG } from '../engine/rng';
import { GameState } from '../engine/types';
import { fastTableHand, fromTuple, skillFromSetup, SkillTuple } from '../world/fastTable';
import { prizeStructure } from '../world/prizes';
import { templateById } from '../world/calendar';

export interface MTTConfig {
  entrants: number;       // 참가자 수 (사람 포함)
  tableSize: 6 | 9;
  buyIn: number;          // 가상 바이인 (상금 계산용)
  reentry: boolean;       // 사람 재진입 허용
  reentryUntilLevel: number;
  maxReentries: number;
  /** 레이트 등록: 이 레벨(1부터)까지 라운드마다 신규 참가자 입장 (0/미지정 = 없음) */
  lateRegUntilLevel?: number;
  /** 라운드당 평균 신규 입장 인원 */
  lateRegPerRound?: number;
  /** 탈락한 AI 가 레이트 등록 시간 안에 재진입 */
  aiReentry?: boolean;
  /** 대규모 필드: 내 테이블이 아닌 테이블은 배치 시뮬레이터로 진행 */
  fast?: boolean;
  /** PKO / 미스터리 바운티: 바이인의 share 가 바운티로 분리 */
  bounty?: { share: number; mystery?: boolean };
  /** 월드 이벤트(상금표·보장·새틀라이트가 이벤트 정의에서 나온다) */
  world?: { eventId: string };
}

/** 이 대회의 상금표. 월드 이벤트는 이벤트 정의(보장 상금·입상률·PKO 분리), 일반 대회는 기본 구조. */
export function payoutsFor(cfg: MTTConfig, total: number): { payouts: number[]; prizePool: number } {
  if (cfg.world) {
    const ev = templateById(cfg.world.eventId);
    const ps = prizeStructure(ev, total, ev.satelliteFor ? templateById(ev.satelliteFor).buyIn : 0);
    return { payouts: ps.payouts, prizePool: ps.prizePool };
  }
  return { payouts: payoutStructure(total, cfg.buyIn), prizePool: cfg.buyIn * total };
}

export interface MTTTable { id: number; game: GameState }
export interface MTTState {
  config: MTTConfig;
  tables: MTTTable[];            // 내 테이블 포함 모든 테이블
  heroTable: number | null;      // 내가 앉은 테이블 id (탈락 시 null)
  round: number;                 // 완료한 라운드 수
  level: number;                 // 현재 블라인드 레벨(0 부터)
  levelRound: number;            // 현재 레벨에서 진행한 라운드
  levelLen: number;              // 현재 레벨의 계획된 길이(라운드)
  startStack: number;
  prizePool: number;
  payouts: number[];
  places: Record<string, number>; // 탈락한 플레이어 id → 최종 순위 (재진입 시 갱신)
  names: Record<string, string>;
  remaining: number;
  entries: number;               // 사람의 총 엔트리 수 (재진입 포함)
  /** 총 엔트리 수 (초기 + 레이트 등록 + 재진입). 최종 순위의 기준 */
  totalEntries: number;
  /** 탈락 엔트리 id (먼저 탈락 = 낮은 순위). 순위 = totalEntries − index */
  bustSeq: string[];
  registrationOpen: boolean;
  lateJoined: number;
  aiCounter: number;
  heroOut: boolean;
  heroCanReenter: boolean;
  finished: boolean;
  winner?: string;
  heroPrize: number;
  bubble: boolean;
  finalTable: boolean;
  nextTableId: number;
  /** 탈락 기록 (최신이 마지막). 실제 온라인 토너먼트의 탈락 알림용 */
  elims: { id: string; name: string; place: number; round: number }[];
  /** 월드 선수 실력(전 AI). 배치 테이블 시뮬레이션과 순위 표시가 쓴다 */
  skills: Record<string, SkillTuple>;
  /** PKO: 현재 바운티 / 현금으로 얻은 바운티(기본 id 기준, 재진입 엔트리 합산) */
  bounty?: { unit: number; cur: Record<string, number>; cash: Record<string, number> };
  icmLog: { round: number; players: number; heroStack: number; chipShare: number; icmShare: number | null }[];
  log: string[];
}

const nextId = (m: MTTState) => m.nextTableId++;

export interface Opponent { id: string; name: string; profileId: string; difficulty: Difficulty; skill?: SkillTuple }
export function newMTTSession(base: Omit<SessionConfig, 'seats' | 'mode' | 'ais' | 'blindMode'> & { blindMode?: 'regular' | 'adaptive'; mtt: MTTConfig; difficulty: Difficulty; profileId: string; opponents?: Opponent[] }): Session {
  const cfg = base.mtt;
  const stack = base.startBB * base.bb;
  const rng = createRng(base.seed);
  const aiById: Record<string, AISetup> = {};
  const names: Record<string, string> = { hero: base.humanName };
  const all: { id: string; name: string; isHuman: boolean }[] = [{ id: 'hero', name: base.humanName, isHuman: true }];
  // 앞쪽 14명은 고정 이름을 가진 로스터(경기 사이에 관찰 기록 유지), 나머지는 일반 봇
  const roster = base.opponents ? [] : pickOpponents(Math.min(ROSTER.length, cfg.entrants - 1), base.seed);
  const skills: Record<string, SkillTuple> = {};
  if (base.opponents) {
    if (base.opponents.length !== cfg.entrants - 1) throw new Error('상대 목록 길이가 참가자 수와 다릅니다');
    for (const o of base.opponents) {
      aiById[o.id] = { profileId: o.profileId, difficulty: o.difficulty };
      names[o.id] = o.name; all.push({ id: o.id, name: o.name, isHuman: false });
      if (o.skill) skills[o.id] = o.skill;
    }
  }
  for (let i = 1; i < cfg.entrants && !base.opponents; i++) {
    const r = roster[i - 1];
    const id = r ? r.id : `ai${i - 1}`;
    const diff = Math.max(2, Math.min(5, base.difficulty + (rng.int(3) - 1))) as Difficulty;
    aiById[id] = { profileId: r ? r.profileId : PERSONAS[rng.int(PERSONAS.length)].profileId, difficulty: diff };
    names[id] = r ? r.name : `Bot${String(i).padStart(2, '0')}`;
    all.push({ id, name: names[id], isHuman: false });
  }
  // 무작위 좌석 배정
  for (let i = all.length - 1; i > 0; i--) { const j = rng.int(i + 1); [all[i], all[j]] = [all[j], all[i]]; }
  const nTables = Math.ceil(cfg.entrants / cfg.tableSize);
  const groups: typeof all[] = Array.from({ length: nTables }, () => []);
  all.forEach((p, i) => groups[i % nTables].push(p));
  const lvl0 = blindStructure(base.bb)[0];
  const tables: MTTTable[] = groups.map((grp, id) => ({
    id,
    game: createGame({ ...lvl0, maxSeats: cfg.tableSize }, grp.map((p) => makePlayer(p.id, p.name, stack, p.isHuman, p.id === 'hero' ? undefined : aiById[p.id].profileId)), base.seed + id),
  }));
  const heroTable = tables.find((t) => t.game.players.some((p) => p.isHuman))!;
  const pay0 = payoutsFor(cfg, cfg.entrants);
  const payouts = pay0.payouts;
  const mtt: MTTState = {
    config: cfg, tables, heroTable: heroTable.id, round: 0, level: 0, levelRound: 0, levelLen: nextLevelLength(base.blindMode ?? 'regular', base.speed, { avgBB: base.startBB, playersLeft: cfg.entrants, entrants: cfg.entrants, handsPlayed: 0 }), startStack: stack, prizePool: pay0.prizePool, payouts, skills, places: {}, names,
    remaining: cfg.entrants, entries: 1, totalEntries: cfg.entrants, bustSeq: [], registrationOpen: (cfg.lateRegUntilLevel ?? 0) > 0, lateJoined: 0, aiCounter: cfg.entrants - 1, heroOut: false, heroCanReenter: false, finished: false, heroPrize: 0, bubble: false, finalTable: false, nextTableId: nTables, elims: [], icmLog: [], log: [],
  };
  if (cfg.bounty) { const unit = Math.round(cfg.buyIn * cfg.bounty.share); mtt.bounty = { unit, cur: {}, cash: {} }; for (const p of all) mtt.bounty.cur[p.id] = bountyDraw(unit, cfg.bounty.mystery, base.seed, p.id); }
  const config: SessionConfig = { blindMode: base.blindMode ?? 'regular', mode: 'mtt', seats: cfg.tableSize, startBB: base.startBB, bb: base.bb, speed: base.speed, humanName: base.humanName, ais: [], seed: base.seed };
  return {
    version: 1, config, game: heroTable.game, memory: {}, records: [], aiBySeat: {}, aiById, mtt, level: 0, levelHand: 0, startedAt: Date.now(), buyIns: stack * 1, aiLog: [],
  };
}

const heroGame = (m: MTTState) => (m.heroTable === null ? null : m.tables.find((t) => t.id === m.heroTable)!.game);

function setBlinds(g: GameState, bb: number, level: number, base: number) {
  const l = blindStructure(base)[Math.min(level, LEVEL_COUNT - 1)];
  void bb;
  g.config = { ...g.config, sb: l.sb, bb: l.bb, ante: l.ante };
}

/** 핸드 사이에 플레이어 제거/추가 (좌석 인덱스가 바뀌므로 버튼 보정) */
function removePlayers(g: GameState, ids: Set<string>): GameState {
  const keepIdx = g.players.map((p, i) => i).filter((i) => !ids.has(g.players[i].id));
  const players = keepIdx.map((i) => g.players[i]);
  const oldBtn = g.button;
  const newBtn = Math.max(0, keepIdx.filter((i) => i <= oldBtn).length - 1);
  return { ...g, players, button: Math.min(newBtn, Math.max(0, players.length - 1)) };
}
function addPlayer(g: GameState, p: GameState['players'][number]): GameState {
  const pl = { ...p, hole: [], bet: 0, invested: 0, folded: false, allIn: false, acted: false, inHand: false, lastActBet: null, lastAction: '', busted: false };
  return { ...g, players: [...g.players, pl] };
}

function playOutTable(sess: Session, g: GameState, rng: RNG, scale: number): GameState {
  let s: Session = { ...sess, game: g };
  s = { ...s, game: startHand(g, rng) };
  let guard = 0;
  while (s.game.toAct !== null) {
    if (guard++ > 3000) throw new Error('MTT table loop');
    s = aiStep(s, scale).sess;
  }
  return s.game;
}

export function chipTotal(m: MTTState): number {
  return m.tables.reduce((t, tb) => t + tb.game.players.reduce((a, p) => a + p.stack, 0), 0);
}

/** 내 테이블 핸드가 끝난 뒤 호출: 나머지 테이블 1핸드 진행 → 탈락·해체·균형·레벨 갱신 */
export function mttAdvance(sess: Session, rng: RNG, scale = 0.35, autoHero = false): Session {
  const m0 = sess.mtt!;
  if (m0.finished) return sess;
  const m: MTTState = structuredClone(m0);
  const hid = m.heroTable;
  if (hid !== null && !autoHero) m.tables.find((t) => t.id === hid)!.game = structuredClone(sess.game);
  if (autoHero) sess = { ...sess, aiById: { hero: { profileId: 'Balanced', difficulty: 3 }, ...(sess.aiById ?? {}) } };
  const level = m.level;
  const busts: { id: string; start: number }[] = [];

  // 1) 다른 테이블 1핸드 진행 (내 테이블은 이미 진행됨). 대규모 필드는 배치 시뮬레이터 사용.
  const killMap: Record<string, string[]> = {};
  const blindsNow = blindStructure(sess.config.bb)[Math.min(level, LEVEL_COUNT - 1)];
  const pressure = m.remaining > m.payouts.length && m.remaining <= m.payouts.length * 1.15 + 2 ? 1 : m.remaining <= m.payouts.length ? 0.35 : 0;
  const skillOf = (id: string) => (m.skills[id] ? fromTuple(m.skills[id]) : skillFromSetup(sess.aiById?.[id]?.profileId ?? 'Balanced', sess.aiById?.[id]?.difficulty ?? 3));
  for (const tb of m.tables) {
    if (tb.id === hid && !autoHero) continue;
    if (tb.game.players.filter((p) => p.stack > 0).length < 2) continue;
    const g0 = structuredClone(tb.game);
    g0.street = 'complete';
    setBlinds(g0, 0, level, sess.config.bb);
    if (m.config.fast && !(autoHero && tb.id === hid)) {
      const r = fastTableHand(g0, blindsNow, rng, skillOf, pressure);
      tb.game = r.game; Object.assign(killMap, r.kills);
    } else {
      const g = playOutTable({ ...sess, mtt: m }, g0, rng, scale);
      tb.game = g;
      Object.assign(killMap, killersOf(g));
    }
  }
  if (hid !== null && !autoHero) Object.assign(killMap, killersOf(m.tables.find((t) => t.id === hid)!.game));
  // 2) 탈락 수집 (stack 0). 시작 스택으로 동시 탈락 순위 결정
  for (const tb of m.tables) {
    tb.game.players.forEach((p, i) => { if (p.stack === 0 && p.id in m.names) busts.push({ id: p.id, start: tb.game.startStacks[i] ?? 0 }); });
  }
  busts.sort((a, b) => a.start - b.start); // 작은 스택 먼저 = 더 낮은 순위
  busts.forEach((b) => { m.bustSeq.push(b.id); });
  if (m.bounty) for (const b of busts) transferBounty(m, b.id, killMap[b.id] ?? []);
  recomputePlaces(m);
  busts.forEach((b) => { m.elims.push({ id: b.id, name: m.names[b.id] ?? b.id, place: m.places[b.id], round: m.round + 1 }); });
  m.remaining -= busts.length;
  const bustIds = new Set(busts.map((b) => b.id));
  for (const tb of m.tables) tb.game = removePlayers(tb.game, bustIds);
  if (bustIds.has('hero')) {
    m.heroOut = true; m.heroTable = null;
    const place = m.places['hero'];
    m.heroPrize = m.payouts[place - 1] ?? 0;
    m.heroCanReenter = m.config.reentry && level <= m.config.reentryUntilLevel && m.entries - 1 < m.config.maxReentries;
    m.log.push(`탈락: ${place}위${m.heroPrize ? ` (상금 ${m.heroPrize.toLocaleString()})` : ''}`);
  }
  m.round++;
  m.levelRound++;
  // 블라인드 레벨은 모든 테이블의 핸드가 끝난 라운드 사이에서만 바뀐다 (정규/적응형 정책)
  if (m.levelRound >= m.levelLen) {
    m.level++; m.levelRound = 0;
    const bbNow = blindStructure(sess.config.bb)[Math.min(m.level, LEVEL_COUNT - 1)].bb;
    m.levelLen = nextLevelLength(sess.config.blindMode ?? 'regular', sess.config.speed, { avgBB: (m.startStack * m.totalEntries) / Math.max(1, m.remaining) / bbNow, playersLeft: m.remaining, entrants: m.totalEntries, handsPlayed: m.round });
  }
  // 2.5) 레이트 등록 / AI 재진입 (종료 판정 전에 인원 반영)
  const lvNow = level + 1;
  const open = (m.config.lateRegUntilLevel ?? 0) >= lvNow && m.remaining > 1;
  if (open) {
    const per = m.config.lateRegPerRound ?? 0;
    let add = Math.floor(per) + (rng.next() < per - Math.floor(per) ? 1 : 0);
    if (m.config.aiReentry) for (const b of busts) if (b.id !== 'hero' && !b.id.startsWith('hero#') && rng.next() < 0.22) add++;
    const joined = addLateEntrants(m, add, rng, sess);
    sess = { ...sess, aiById: { ...(sess.aiById ?? {}), ...joined } };
  } else if (m.registrationOpen) {
    m.registrationOpen = false;
    m.log.push(`레이트 등록 마감 — 총 ${m.totalEntries}엔트리`);
  }
  { const pp = payoutsFor(m.config, m.totalEntries); m.payouts = pp.payouts; m.prizePool = pp.prizePool; }
  recomputePlaces(m);
  if (bustIds.has('hero')) { const place = m.places['hero']; m.heroPrize = m.payouts[place - 1] ?? 0; }
  // 3) 종료 판정
  if (m.remaining <= 1) {
    const w = m.tables.flatMap((t) => t.game.players).find((p) => p.stack > 0);
    if (w) { if (m.bounty) { const bo = m.bounty; bo.cash[baseId(w.id)] = (bo.cash[baseId(w.id)] ?? 0) + (bo.cur[w.id] ?? 0); bo.cur[w.id] = 0; } m.places[w.id] = 1; m.winner = w.id; m.registrationOpen = false; if (w.id === 'hero') { m.heroPrize = m.payouts[0]; m.heroOut = false; } }
    m.finished = true; m.heroCanReenter = false;
  } else rebalance(m, sess.config.speed);

  // 4) 상태 플래그, ICM 로그
  m.finalTable = m.remaining <= m.config.tableSize && m.tables.length === 1;
  m.bubble = m.remaining === m.payouts.length + 1;
  const hg = heroGame(m);
  if (m.finalTable && hg) {
    const alive = hg.players.filter((p) => p.stack > 0);
    const stacks = alive.map((p) => p.stack);
    const tot = stacks.reduce((a, b) => a + b, 0);
    const hi = alive.findIndex((p) => p.isHuman);
    if (hi >= 0) {
      const e = stacks.length <= 9 ? icm(stacks, m.payouts)[hi] : null;
      m.icmLog.push({ round: m.round, players: alive.length, heroStack: stacks[hi], chipShare: stacks[hi] / tot, icmShare: e === null ? null : e / m.prizePool });
    }
  }
  const ng = blankHand(hg ?? sess.game);
  return { ...sess, mtt: m, game: ng, level: m.level };
}

function recomputePlaces(m: MTTState) {
  m.bustSeq.forEach((id, i) => { m.places[id] = m.totalEntries - i; });
}

/** 신규 AI 참가자를 자리가 있는 테이블(없으면 새 테이블)에 착석 */
function addLateEntrants(m: MTTState, n: number, rng: RNG, sess: Session): Record<string, AISetup> {
  const out: Record<string, AISetup> = {};
  const size = m.config.tableSize;
  const baseDiff = (Object.values(sess.aiById ?? {})[0]?.difficulty ?? 3) as Difficulty;
  for (let k = 0; k < n; k++) {
    m.aiCounter++;
    const id = `ai${m.aiCounter}`;
    const diff = Math.max(1, Math.min(5, baseDiff + (rng.int(3) - 1))) as Difficulty;
    const setup: AISetup = { profileId: PERSONAS[rng.int(PERSONAS.length)].profileId, difficulty: diff };
    out[id] = setup;
    m.names[id] = `Bot${String(m.aiCounter + 1).padStart(2, '0')}`;
    const p = makePlayer(id, m.names[id], m.startStack, false, setup.profileId);
    const open = m.tables.filter((t) => t.game.players.length < size);
    if (open.length) { const t = open.reduce((a, b) => (b.game.players.length < a.game.players.length ? b : a)); t.game = addPlayer(t.game, p); }
    else {
      const lv = blindStructure(sess.config.bb)[Math.min(sess.level, LEVEL_COUNT - 1)];
      const dummy = `__tmp${id}`;
      const g0 = createGame({ sb: lv.sb, bb: lv.bb, ante: lv.ante, maxSeats: size }, [p, makePlayer(dummy, 'tmp', 1, false)], m.aiCounter);
      m.tables.push({ id: m.nextTableId++, game: removePlayers(g0, new Set([dummy])) });
    }
    m.totalEntries++; m.remaining++; m.lateJoined++;
    if (m.bounty) m.bounty.cur[id] = bountyDraw(m.bounty.unit, m.config.bounty?.mystery, m.aiCounter, id);
  }
  return out;
}

/** 핸드 사이에 플레이어 구성이 바뀔 수 있으므로 직전 핸드의 카드/좌석 종속 정보를 비운다 */
export function blankHand(g: GameState): GameState {
  const ng = structuredClone(g);
  ng.street = 'complete'; ng.deck = []; ng.deckPos = 0; ng.board = []; ng.burned = []; ng.events = []; ng.actionLog = []; ng.result = null; ng.toAct = null;
  ng.currentBet = 0; ng.gameOver = false;
  ng.players.forEach((p) => { p.hole = []; p.bet = 0; p.invested = 0; p.folded = false; p.allIn = false; p.acted = false; p.inHand = false; p.lastActBet = null; p.lastAction = ''; p.busted = false; });
  ng.startStacks = ng.players.map((p) => p.stack);
  ng.totalChips = ng.players.reduce((t, p) => t + p.stack, 0);
  ng.sbSeat = -1; ng.bbSeat = -1;
  return ng;
}

/** 테이블 해체와 인원 균형 */
function rebalance(m: MTTState, speed: Speed) {
  void speed;
  const size = m.config.tableSize;
  const alivePlayers = () => m.tables.flatMap((t) => t.game.players).length;
  const R = alivePlayers();
  const needed = Math.ceil(R / size);
  const count = (t: MTTTable) => t.game.players.length;
  // 해체: 가장 작은 테이블(내 테이블 제외 우선)
  while (m.tables.length > needed) {
    const cands = m.tables.filter((t) => t.id !== m.heroTable);
    const pool = cands.length ? cands : m.tables;
    const victim = pool.reduce((a, b) => (count(b) < count(a) ? b : a));
    const others = m.tables.filter((t) => t.id !== victim.id);
    for (const p of victim.game.players) {
      const dest = others.filter((t) => count(t) < size).reduce((a, b) => (count(b) < count(a) ? b : a));
      dest.game = addPlayer(dest.game, p);
    }
    m.tables = others;
    if (victim.id === m.heroTable) {
      m.heroTable = m.tables.find((t) => t.game.players.some((p) => p.isHuman))?.id ?? null;
    }
  }
  // 균형: 최대-최소 ≥ 2 이면 이동 (사람이 아닌 플레이어 우선, 이동 플레이어는 최대 테이블의 BB 위치 직전 등 단순화: 마지막 좌석)
  for (let guard = 0; guard < 200; guard++) {
    if (m.tables.length < 2) break;
    const big = m.tables.reduce((a, b) => (count(b) > count(a) ? b : a));
    const small = m.tables.reduce((a, b) => (count(b) < count(a) ? b : a));
    if (count(big) - count(small) < 2) break;
    const movable = big.game.players.filter((p) => !p.isHuman);
    const mv = (movable.length ? movable : big.game.players)[movable.length ? movable.length - 1 : big.game.players.length - 1];
    big.game = removePlayers(big.game, new Set([mv.id]));
    small.game = addPlayer(small.game, mv);
    if (mv.isHuman) m.heroTable = small.id;
  }
  void nextId;
}

/** 재진입: 새 스택으로 가장 인원이 적은 테이블에 착석 */
export function mttReenter(sess: Session): Session {
  const m: MTTState = structuredClone(sess.mtt!);
  if (!m.heroCanReenter) throw new Error('재진입 불가');
  const t = m.tables.reduce((a, b) => (b.game.players.length < a.game.players.length ? b : a));
  if (t.game.players.length >= m.config.tableSize) throw new Error('빈 좌석 없음');
  // 이전 엔트리의 탈락 기록은 hero#n 으로 보존 (새 엔트리가 'hero' 를 이어받음)
  const old = `hero#${m.entries}`;
  m.bustSeq = m.bustSeq.map((x) => (x === 'hero' ? old : x));
  m.names[old] = m.names['hero']; delete m.places['hero'];
  t.game = addPlayer(t.game, makePlayer('hero', m.names['hero'], m.startStack, true));
  m.heroTable = t.id; m.heroOut = false; m.heroCanReenter = false; m.entries++;
  m.remaining++; m.totalEntries++; m.heroPrize = 0;
  { const pp = payoutsFor(m.config, m.totalEntries); m.payouts = pp.payouts; m.prizePool = pp.prizePool; }
  if (m.bounty) m.bounty.cur['hero'] = bountyDraw(m.bounty.unit, m.config.bounty?.mystery, sess.config.seed + m.entries * 7919, 'hero');
  recomputePlaces(m);
  return { ...sess, mtt: m, game: blankHand(t.game) };
}

/** 사람이 탈락한 뒤 남은 토너먼트를 끝까지 시뮬레이션 (결과 확인용) */
export function mttSimToEnd(sess: Session, rng: RNG, scale = 0.3): Session {
  let s = sess;
  let guard = 0;
  while (!s.mtt!.finished) {
    if (guard++ > 2000) throw new Error('MTT did not finish');
    s = mttAdvance(s, rng, scale, true);
  }
  return s;
}

export function heroTableGame(sess: Session): GameState {
  return sess.game;
}

export { beginHand };

// ───────── PKO / 미스터리 바운티 ─────────
const baseId = (id: string) => id.replace(/#\d+$/, '');
/** 엔트리 시작 바운티. 미스터리는 시드·id 로 결정되는 분포(평균 1배, 드물게 큰 값) — 보여 주기 전까지 알 수 없다. */
export function bountyDraw(unit: number, mystery: boolean | undefined, seed: number, id: string): number {
  if (!mystery) return unit;
  let h = 2166136261 ^ seed; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const u = ((h >>> 0) % 10000) / 10000;
  const mult = u < 0.5 ? 0.25 : u < 0.8 ? 0.625 : u < 0.92 ? 1.25 : u < 0.98 ? 3.125 : u < 0.998 ? 12.5 : 62.5; // 평균 ≈ 1
  return Math.max(1, Math.round(unit * mult));
}
/** 탈락자의 바운티: 절반은 현금으로 킬러(들)에게, 절반은 킬러의 바운티에 더해진다. 킬러가 둘 이상이면 균등 분배. */
function transferBounty(m: MTTState, bustedId: string, killers: string[]) {
  const bo = m.bounty!;
  const val = bo.cur[bustedId] ?? 0; delete bo.cur[bustedId];
  if (val <= 0 || !killers.length) return;
  const half = Math.floor(val / 2), per = Math.floor(half / killers.length);
  let rem = val;
  for (const k of killers) { bo.cash[baseId(k)] = (bo.cash[baseId(k)] ?? 0) + per; bo.cur[k] = (bo.cur[k] ?? 0) + per; rem -= per * 2; }
  bo.cash[baseId(killers[0])] = (bo.cash[baseId(killers[0])] ?? 0) + rem;
}
/** 엔진 테이블의 결과에서, 이번 핸드에 탈락한 좌석을 이긴 사람들(해당 좌석이 참여한 마지막 팟의 승자) */
function killersOf(g: GameState): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const res = g.result; if (!res) return out;
  g.players.forEach((p, i) => {
    if (p.stack !== 0) return;
    const pots = res.pots.filter((pt) => pt.eligible.includes(i));
    const last = pots[pots.length - 1];
    if (last) out[p.id] = last.winners.filter((w) => w !== i).map((w) => g.players[w].id);
  });
  return out;
}
/** 히어로가 받은 현금 바운티 (재진입 엔트리 합산) */
export const heroBountyCash = (m: MTTState): number => m.bounty?.cash['hero'] ?? 0;
