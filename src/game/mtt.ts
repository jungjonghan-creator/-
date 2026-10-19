import { AISetup, Difficulty, PROFILE_IDS } from '../ai/profiles';
import { aiStep, beginHand, blindStructure, LEVEL_COUNT, HANDS_PER_LEVEL, Session, SessionConfig, Speed } from './session';
import { icm, payoutStructure } from './icm';
import { createGame, makePlayer, startHand } from '../engine/game';
import { createRng, RNG } from '../engine/rng';
import { GameState } from '../engine/types';

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
}

export interface MTTTable { id: number; game: GameState }
export interface MTTState {
  config: MTTConfig;
  tables: MTTTable[];            // 내 테이블 포함 모든 테이블
  heroTable: number | null;      // 내가 앉은 테이블 id (탈락 시 null)
  round: number;                 // 완료한 라운드 수
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
  icmLog: { round: number; players: number; heroStack: number; chipShare: number; icmShare: number | null }[];
  log: string[];
}

const nextId = (m: MTTState) => m.nextTableId++;

export function newMTTSession(base: Omit<SessionConfig, 'seats' | 'mode' | 'ais'> & { mtt: MTTConfig; difficulty: Difficulty; profileId: string }): Session {
  const cfg = base.mtt;
  const stack = base.startBB * base.bb;
  const rng = createRng(base.seed);
  const aiById: Record<string, AISetup> = {};
  const names: Record<string, string> = { hero: base.humanName };
  const all: { id: string; name: string; isHuman: boolean }[] = [{ id: 'hero', name: base.humanName, isHuman: true }];
  for (let i = 1; i < cfg.entrants; i++) {
    const id = `ai${i - 1}`;
    const diff = Math.max(1, Math.min(5, base.difficulty + (rng.int(3) - 1))) as Difficulty;
    aiById[id] = { profileId: i === 1 ? base.profileId : PROFILE_IDS[rng.int(PROFILE_IDS.length)], difficulty: diff };
    names[id] = i === 1 ? 'NOVA' : `Bot${String(i).padStart(2, '0')}`;
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
  const payouts = payoutStructure(cfg.entrants, cfg.buyIn);
  const mtt: MTTState = {
    config: cfg, tables, heroTable: heroTable.id, round: 0, startStack: stack, prizePool: cfg.buyIn * cfg.entrants, payouts, places: {}, names,
    remaining: cfg.entrants, entries: 1, totalEntries: cfg.entrants, bustSeq: [], registrationOpen: (cfg.lateRegUntilLevel ?? 0) > 0, lateJoined: 0, aiCounter: cfg.entrants - 1, heroOut: false, heroCanReenter: false, finished: false, heroPrize: 0, bubble: false, finalTable: false, nextTableId: nTables, elims: [], icmLog: [], log: [],
  };
  const config: SessionConfig = { mode: 'mtt', seats: cfg.tableSize, startBB: base.startBB, bb: base.bb, speed: base.speed, humanName: base.humanName, ais: [], seed: base.seed };
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
  const level = Math.floor(m.round / HANDS_PER_LEVEL[sess.config.speed]);
  const busts: { id: string; start: number }[] = [];

  // 1) 다른 테이블 1핸드 진행 (내 테이블은 이미 진행됨)
  for (const tb of m.tables) {
    if (tb.id === hid && !autoHero) continue;
    if (tb.game.players.filter((p) => p.stack > 0).length < 2) continue;
    const g0 = structuredClone(tb.game);
    g0.street = 'complete';
    setBlinds(g0, 0, level, sess.config.bb);
    const g = playOutTable({ ...sess, mtt: m }, g0, rng, scale);
    tb.game = g;
  }
  // 2) 탈락 수집 (stack 0). 시작 스택으로 동시 탈락 순위 결정
  for (const tb of m.tables) {
    tb.game.players.forEach((p, i) => { if (p.stack === 0 && p.id in m.names) busts.push({ id: p.id, start: tb.game.startStacks[i] ?? 0 }); });
  }
  busts.sort((a, b) => a.start - b.start); // 작은 스택 먼저 = 더 낮은 순위
  busts.forEach((b) => { m.bustSeq.push(b.id); });
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
  m.payouts = payoutStructure(m.totalEntries, m.config.buyIn);
  m.prizePool = m.config.buyIn * m.totalEntries;
  recomputePlaces(m);
  if (bustIds.has('hero')) { const place = m.places['hero']; m.heroPrize = m.payouts[place - 1] ?? 0; }
  // 3) 종료 판정
  if (m.remaining <= 1) {
    const w = m.tables.flatMap((t) => t.game.players).find((p) => p.stack > 0);
    if (w) { m.places[w.id] = 1; m.winner = w.id; m.registrationOpen = false; if (w.id === 'hero') { m.heroPrize = m.payouts[0]; m.heroOut = false; } }
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
  return { ...sess, mtt: m, game: ng, level };
}

function recomputePlaces(m: MTTState) {
  m.bustSeq.forEach((id, i) => { m.places[id] = m.totalEntries - i; });
}

/** 신규 AI 참가자를 자리가 있는 테이블(없으면 새 테이블)에 착석 */
function addLateEntrants(m: MTTState, n: number, rng: RNG, sess: Session): Record<string, AISetup> {
  const out: Record<string, AISetup> = {};
  const size = m.config.tableSize;
  const baseDiff = (sess.aiById?.ai0?.difficulty ?? 3) as Difficulty;
  for (let k = 0; k < n; k++) {
    m.aiCounter++;
    const id = `ai${m.aiCounter}`;
    const diff = Math.max(1, Math.min(5, baseDiff + (rng.int(3) - 1))) as Difficulty;
    const setup: AISetup = { profileId: PROFILE_IDS[rng.int(PROFILE_IDS.length)], difficulty: diff };
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
  m.payouts = payoutStructure(m.totalEntries, m.config.buyIn); m.prizePool = m.config.buyIn * m.totalEntries;
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
