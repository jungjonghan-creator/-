import { decide, Decision } from '../ai/decide';
import { observe } from '../ai/observation';
import { AISetup, Difficulty, PROFILE_IDS } from '../ai/profiles';
import { OppModel, updateModel } from '../ai/opponentModel';
import { createGame, makePlayer, startHand, applyAction, toHandRecord, liveCount, checkInvariants } from '../engine/game';
import { createRng, randomSeed } from '../engine/rng';
import { Action, AllInAction, GameConfig, GameState, HandRecord } from '../engine/types';

export type Mode = 'cash' | 'headsup-sng' | 'sng' | 'trainer' | 'mtt';
export type Speed = 'normal' | 'turbo' | 'hyper';

export interface BlindLevel { sb: number; bb: number; ante: number }

export interface SessionConfig {
  mode: Mode;
  seats: number;            // 2 | 6 | 9
  startBB: number;          // 시작 스택(BB)
  bb: number;
  speed: Speed;
  rake?: { pct: number; cap: number } | null;
  humanName: string;
  ais: AISetup[];           // seats-1 개
  seed: number;
  /** 스토리 모드: AI 표시 이름과 챕터 정보 */
  aiNames?: string[];
  story?: { chapter: number; buyIn: number };
}

export interface Session {
  version: 1;
  config: SessionConfig;
  game: GameState;
  memory: OppModel;
  records: HandRecord[];
  aiBySeat: Record<number, AISetup>;
  /** 플레이어 id → AI 설정 (테이블 이동에도 유지). 있으면 aiBySeat 보다 우선 */
  aiById?: Record<string, AISetup>;
  mtt?: import('./mtt').MTTState;
  tourneyRecorded?: boolean;
  /** 해설/대사 피드 (스토리·해설) */
  feed?: import('../story/director').StoryLine[];
  directedHand?: number;
  tierId?: string;
  /** 직전 토너먼트 상태 스냅샷 (알림 차이 계산용) */
  tstat?: import('./tourney').TourneyStatus;
  level: number;
  levelHand: number;        // 현재 레벨에서 치른 핸드 수
  startedAt: number;
  buyIns: number;           // 사람 누적 바이인 (캐시: 칩)
  aiLog: { handNo: number; seat: number; note: string }[];
}

export const HANDS_PER_LEVEL: Record<Speed, number> = { normal: 10, turbo: 6, hyper: 3 };

export const LEVEL_COUNT = 40;
export function blindStructure(baseBB: number): BlindLevel[] {
  const mult = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];
  while (mult.length < LEVEL_COUNT) mult.push(Math.round(mult[mult.length - 1] * 1.5));
  return mult.map((m, i) => {
    const bb = Math.round(baseBB * m);
    return { sb: Math.round(bb / 2), bb, ante: i >= 3 ? Math.max(1, Math.round(bb / 8)) : 0 };
  });
}

export function currentBlinds(sess: Session): BlindLevel {
  const c = sess.config;
  if (c.mode === 'cash' || c.mode === 'trainer') return { sb: Math.round(c.bb / 2), bb: c.bb, ante: 0 };
  const st = blindStructure(c.bb);
  return st[Math.min(sess.level, st.length - 1)];
}

export function newSession(config: SessionConfig): Session {
  const stack = config.startBB * config.bb;
  const players = [makePlayer('hero', config.humanName, stack, true)];
  const aiBySeat: Record<number, AISetup> = {};
  const aiById: Record<string, AISetup> = {};
  const names = ['NOVA', 'ORION', 'LYRA', 'VEGA', 'ATLAS', 'IRIS', 'RIGEL', 'SIRIUS'];
  config.ais.forEach((ai, i) => {
    players.push(makePlayer(`ai${i}`, config.aiNames?.[i] ?? names[i % names.length], stack, false, ai.profileId));
    aiBySeat[i + 1] = ai;
    aiById[`ai${i}`] = ai;
  });
  const gc: GameConfig = { sb: Math.round(config.bb / 2), bb: config.bb, ante: 0, maxSeats: config.seats };
  const game = createGame(gc, players, config.seed);
  return { version: 1, config, game, memory: {}, records: [], aiBySeat, aiById, level: 0, levelHand: 0, startedAt: Date.now(), buyIns: stack, aiLog: [] };
}

export function defaultAIs(n: number, difficulty: Difficulty = 3, first = 'Balanced'): AISetup[] {
  const out: AISetup[] = [{ profileId: first, difficulty }];
  const rest = PROFILE_IDS.filter((p) => p !== first);
  for (let i = 1; i < n; i++) out.push({ profileId: rest[(i - 1) % rest.length], difficulty });
  return out;
}

/** 다음 핸드 시작 (이전 핸드가 complete 상태여야 함) */
export function beginHand(sess: Session, rng = createRng(randomSeed())): Session {
  let { level, levelHand } = sess;
  const cfg = sess.config;
  let game = sess.game;
  if (game.handNo > 0 && (cfg.mode === 'sng' || cfg.mode === 'headsup-sng')) {
    levelHand++;
    if (levelHand >= HANDS_PER_LEVEL[cfg.speed]) { level++; levelHand = 0; }
  }
  const tmp: Session = { ...sess, level, levelHand };
  const b = currentBlinds(tmp);
  game = { ...game, config: { ...game.config, ...b } };
  // 캐시게임: AI 가 칩이 바닥나면 자동 리바이 (사람은 직접 선택)
  if (cfg.mode === 'cash' || cfg.mode === 'trainer') {
    game = structuredClone(game);
    game.gameOver = false;
    game.players.forEach((p, i) => {
      if (!p.isHuman && p.stack < game.config.bb) {
        const add = cfg.startBB * cfg.bb - p.stack;
        p.stack += add; p.busted = false; game.ledger.push({ handNo: game.handNo + 1, seat: i, kind: 'rebuy', amount: add });
      }
    });
  }
  const next = startHand(game, rng);
  return { ...tmp, game: next };
}

export function rebuy(sess: Session, seat: number, amount: number): Session {
  if (sess.game.street !== 'complete') throw new Error('리바이는 핸드 사이에만 가능합니다');
  if (sess.config.mode !== 'cash' && sess.config.mode !== 'trainer') throw new Error('캐시게임에서만 가능');
  const game = structuredClone(sess.game);
  const p = game.players[seat];
  if (amount <= 0 || !Number.isInteger(amount)) throw new Error('invalid amount');
  p.stack += amount; p.busted = false;
  game.ledger.push({ handNo: game.handNo, seat, kind: sess.game.players[seat].stack === 0 ? 'rebuy' : 'topup', amount });
  return { ...sess, game, buyIns: sess.buyIns + (p.isHuman ? amount : 0) };
}

function finishIfComplete(sess: Session, before: GameState, after: GameState): Session {
  if (after.street === 'complete' && before.street !== 'complete') {
    const rec = toHandRecord(after);
    const memory = structuredClone(sess.memory);
    updateModel(memory, rec);
    return { ...sess, game: after, records: [...sess.records, rec], memory };
  }
  return { ...sess, game: after };
}

export function humanAct(sess: Session, action: Action | AllInAction): Session {
  const g = sess.game;
  if (g.toAct === null || !g.players[g.toAct].isHuman) throw new Error('not human turn');
  return finishIfComplete(sess, g, applyAction(g, action));
}

export const isAITurn = (sess: Session) => sess.game.toAct !== null && !sess.game.players[sess.game.toAct].isHuman;
export const isHumanTurn = (sess: Session) => sess.game.toAct !== null && sess.game.players[sess.game.toAct].isHuman;
export const handOver = (sess: Session) => sess.game.street === 'complete';

/** AI 한 번 행동. RNG 는 (게임시드, 핸드, 이벤트수, 좌석)에서 유도 → 저장 복구 후에도 동일 결정 */
/** AI 에게 전달하는 공개 토너먼트 정보 */
export function tournamentContext(sess: Session): { playersLeft: number; paid: number; avgStack: number } | undefined {
  const c = sess.config;
  if (c.mode === 'mtt' && sess.mtt) {
    const m = sess.mtt;
    return { playersLeft: m.remaining, paid: m.payouts.length, avgStack: m.startStack * m.totalEntries / Math.max(1, m.remaining) };
  }
  if (c.mode === 'sng' || c.mode === 'headsup-sng') {
    const n = sess.game.players.length;
    const alive = sess.game.players.filter((p) => !p.busted).length;
    return { playersLeft: alive, paid: n <= 2 ? 1 : n <= 6 ? 2 : 3, avgStack: sess.game.players.reduce((t, p) => t + p.stack + p.invested, 0) / Math.max(1, alive) };
  }
  return undefined;
}

export function aiStep(sess: Session, simScale = 1): { sess: Session; decision: Decision } {
  const g = sess.game;
  const seat = g.toAct as number;
  const setup = sess.aiById?.[g.players[seat].id] ?? sess.aiBySeat[seat];
  const obs = observe(g, seat, tournamentContext(sess));
  const rng = createRng((g.seed ^ Math.imul(g.handNo + 1, 2654435761) ^ Math.imul(g.events.length + 7, 40503) ^ (seat * 977)) >>> 0);
  const decision = decide(obs, setup, sess.memory, rng, sess.config.seed, simScale);
  let next: GameState;
  try { next = applyAction(g, decision.action); }
  catch { next = applyAction(g, obs.legal.canCheck ? { type: 'check' } : { type: 'fold' }); }
  const out = finishIfComplete(sess, g, next);
  return { sess: { ...out, aiLog: [...out.aiLog.slice(-200), { handNo: g.handNo, seat, note: decision.info.note }] }, decision };
}

/** 사람 차례 또는 핸드 종료까지 AI 를 진행 */
export function runAIUntilHuman(sess: Session): Session {
  let s = sess;
  let guard = 0;
  while (isAITurn(s)) { if (guard++ > 1000) throw new Error('AI loop'); s = aiStep(s).sess; }
  return s;
}

export function sessionOver(sess: Session): boolean {
  const g = sess.game;
  if (sess.config.mode === 'mtt') return !!(sess.mtt?.finished || (sess.mtt?.heroOut && !sess.mtt?.heroCanReenter));
  if (sess.config.mode === 'cash' || sess.config.mode === 'trainer') return false;
  return g.gameOver || liveCount(g) < 2;
}

export const verify = (sess: Session) => checkInvariants(sess.game);

/** AI 끼리만 전체 시뮬레이션 (통계/테스트용). 사람 자리도 AI 로 대체 */
export function simulateAll(config: SessionConfig, hands: number, humanAI: AISetup): Session {
  let s = newSession(config);
  s = { ...s, aiBySeat: { ...s.aiBySeat, 0: humanAI } };
  s.game.players[0].isHuman = false;
  const rng = createRng(config.seed);
  for (let h = 0; h < hands; h++) {
    if (sessionOver(s)) break;
    s = beginHand(s, rng);
    if (s.game.gameOver) break;
    let guard = 0;
    while (s.game.toAct !== null) { if (guard++ > 2000) throw new Error('loop'); s = aiStep(s).sess; }
  }
  return s;
}
