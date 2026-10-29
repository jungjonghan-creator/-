import { AI_LEVELS, Difficulty } from '../ai/profiles';
import { Speed } from '../game/session';
import { BlindMode } from '../game/blinds';
import { EventDef, SEASON_GROWTH, templateById } from '../world/calendar';
import { feeOf } from '../world/prizes';

export type LevelId = (typeof AI_LEVELS)[number]['id'];

// ───────── 캐시게임 ─────────
export interface CashTable {
  id: string; name: string; sb: number; bb: number;
  /** 바이인 범위 (기본 40~100BB, 설정값) */
  minBuy: number; maxBuy: number;
  seats: 6 | 2;
  recommended: LevelId;
  blurb: string;
}
export const BUYIN_RANGE_BB = { min: 40, max: 100 };
const mkTable = (id: string, name: string, sb: number, bb: number, recommended: LevelId, blurb: string, seats: 6 | 2 = 6): CashTable =>
  ({ id, name, sb, bb, minBuy: BUYIN_RANGE_BB.min * bb, maxBuy: BUYIN_RANGE_BB.max * bb, seats, recommended, blurb });

export const CASH_TABLES: CashTable[] = [
  mkTable('c1', '초급 테이블', 5, 10, 'beginner', '작은 판돈으로 상대 성향을 익히는 곳'),
  mkTable('c2', '중급 테이블', 25, 50, 'intermediate', '포지션과 팟오즈가 승부를 가르는 곳'),
  mkTable('c3', '상급 테이블', 100, 200, 'advanced', '3벳·체크레이즈가 오가는 높은 판돈'),
  mkTable('c4', '프로 테이블', 500, 1000, 'pro', '실수가 곧 큰 손실. 최고 판돈'),
];
export const PRACTICE_TABLE: CashTable = { ...mkTable('practice', '무료 연습 테이블', 5, 10, 'beginner', '칩이 통장과 연결되지 않는 연습'), minBuy: 1000, maxBuy: 1000 };
export const cashTableById = (id: string) => [...CASH_TABLES, PRACTICE_TABLE].find((t) => t.id === id)!;

// ───────── 토너먼트 ─────────
export interface TournamentDef {
  id: string; name: string; group: 'free' | 'sng' | 'mtt';
  kind: 'hu' | 'sng' | 'mtt';
  entrants: number; tableSize: 2 | 6 | 8 | 9;
  startBB: number;        // 시작 스택(BB)
  bb: number;             // 레벨 1의 BB
  speed: Speed;
  blindMode: BlindMode;
  buyIn: number; fee: number;
  /** 프리롤: 하우스가 보장하는 가상 상금 풀 */
  guarantee?: number;
  lateRegUntilLevel?: number; lateRegPerRound?: number; aiReentry?: boolean; reentry?: boolean;
  recommended: LevelId;
  desc: string;
  /** 월드 이벤트에서 만들어진 정의(개인 인스턴스). 상금표·바운티·재진입 규칙이 이벤트 정의를 따른다 */
  world?: { eventId: string; season: number };
  /** 헤즈업 토너먼트표/슛아웃 */
  staged?: 'hu' | 'shootout';
  bounty?: { share: number; mystery?: boolean };
  reentryMax?: number;
}

export const TOURNAMENTS: TournamentDef[] = [
  { id: 'free9', name: '프리롤 싯앤고 9', group: 'free', kind: 'sng', entrants: 9, tableSize: 9, startBB: 30, bb: 100, speed: 'turbo', blindMode: 'regular', buyIn: 0, fee: 0, guarantee: 300, recommended: 'beginner', desc: '무료 참가. 가상 상금 300 (1위 180 · 2위 90 · 3위 30). 파산했을 때 다시 일어서는 경로.' },
  { id: 'hu', name: '헤즈업 싯앤고', group: 'sng', kind: 'hu', entrants: 2, tableSize: 2, startBB: 30, bb: 100, speed: 'turbo', blindMode: 'regular', buyIn: 250, fee: 25, recommended: 'intermediate', desc: '1:1 승자독식. 블라인드가 빨라 스택이 금세 짧아집니다.' },
  { id: 'sng9a', name: '초급 싯앤고 9', group: 'sng', kind: 'sng', entrants: 9, tableSize: 9, startBB: 50, bb: 100, speed: 'normal', blindMode: 'regular', buyIn: 100, fee: 0, recommended: 'beginner', desc: '9명, 3위까지 입상 (60/30/10).' },
  { id: 'sng9b', name: '중급 싯앤고 9', group: 'sng', kind: 'sng', entrants: 9, tableSize: 9, startBB: 50, bb: 100, speed: 'normal', blindMode: 'regular', buyIn: 1000, fee: 100, recommended: 'intermediate', desc: '참가비 1,000 + 수수료 100. 우승 5,400.' },
  { id: 'sng9c', name: '상급 싯앤고 9', group: 'sng', kind: 'sng', entrants: 9, tableSize: 9, startBB: 50, bb: 100, speed: 'normal', blindMode: 'adaptive', buyIn: 5000, fee: 500, recommended: 'advanced', desc: '참가비 5,000 + 수수료 500. 우승 27,000. 상황 적응형 블라인드.' },
  { id: 'sng9d', name: '프로 싯앤고 9', group: 'sng', kind: 'sng', entrants: 9, tableSize: 9, startBB: 50, bb: 100, speed: 'turbo', blindMode: 'adaptive', buyIn: 20000, fee: 2000, recommended: 'pro', desc: '참가비 20,000 + 수수료 2,000. 우승 108,000. 최고 판돈.' },
  { id: 'mtt27', name: '로컬 MTT 27', group: 'mtt', kind: 'mtt', entrants: 27, tableSize: 9, startBB: 50, bb: 100, speed: 'turbo', blindMode: 'regular', buyIn: 500, fee: 50, recommended: 'beginner', desc: '3개 테이블에서 시작해 파이널 테이블까지.' },
  { id: 'mtt54', name: '데일리 MTT 54+', group: 'mtt', kind: 'mtt', entrants: 54, tableSize: 9, startBB: 60, bb: 100, speed: 'turbo', blindMode: 'adaptive', buyIn: 1000, fee: 100, lateRegUntilLevel: 3, lateRegPerRound: 0.8, aiReentry: true, reentry: true, recommended: 'intermediate', desc: '레이트 등록으로 참가자가 늘고 탈락자가 재진입합니다.' },
  { id: 'mtt108', name: '위크엔드 MTT 108+', group: 'mtt', kind: 'mtt', entrants: 108, tableSize: 9, startBB: 75, bb: 100, speed: 'turbo', blindMode: 'adaptive', buyIn: 2500, fee: 250, lateRegUntilLevel: 4, lateRegPerRound: 1.2, aiReentry: true, reentry: true, recommended: 'advanced', desc: '12개 테이블로 시작. 버블이 길게 이어집니다.' },
  { id: 'mtt216', name: '메인 이벤트 MTT 216+', group: 'mtt', kind: 'mtt', entrants: 216, tableSize: 9, startBB: 100, bb: 100, speed: 'turbo', blindMode: 'adaptive', buyIn: 10000, fee: 1000, lateRegUntilLevel: 5, lateRegPerRound: 1.6, aiReentry: true, reentry: true, recommended: 'pro', desc: '24개 테이블. 가장 긴 여정, 가장 큰 상금.' },
];
export const PERSONAL_SEASON = 2035;
/** 이벤트가 개인 인스턴스로 플레이 가능한가 (엔진이 규칙을 완전히 구현한 형식만). 아니면 이유를 돌려준다 */
export function playableReason(ev: EventDef): string | null {
  void ev; // HU 브래킷·슛아웃은 단계형 세션(src/game/staged.ts)으로 개인 참가를 지원한다
  return null;
}
export function worldDef(ev: EventDef, season = PERSONAL_SEASON): TournamentDef {
  const field = Math.max(8, Math.round(ev.field * (SEASON_GROWTH[season] ?? 1)));
  const lateLv = ev.lateRegLevels ?? 0;
  const hpl = { slow: 15, normal: 10, turbo: 6, hyper: 3 }[ev.speed];
  return {
    id: `world:${ev.id}`, name: ev.name, group: 'mtt', kind: ev.kind === 'hu' ? 'hu' : ev.kind === 'shootout' ? 'sng' : 'mtt', staged: ev.kind === 'hu' ? 'hu' : ev.kind === 'shootout' ? 'shootout' : undefined, entrants: field, tableSize: ev.tableSize === 2 ? 9 : ev.tableSize, startBB: ev.stackBB, bb: ev.bb0, speed: ev.speed, blindMode: 'regular',
    buyIn: ev.buyIn, fee: feeOf(ev.buyIn, ev.feePct), recommended: 'intermediate',
    lateRegUntilLevel: lateLv || undefined, lateRegPerRound: lateLv ? (0.2 * field) / (lateLv * hpl) : undefined, aiReentry: !!ev.reentry, reentry: !!ev.reentry, reentryMax: ev.reentry?.max,
    bounty: ev.pko, world: { eventId: ev.id, season },
    desc: `${ev.note} · ${field.toLocaleString()}명 · ${ev.stackBB}BB 스타트${ev.pko ? ' · PKO' : ''}${ev.reentry ? ' · 재진입' : ''}`,
  };
}
export const tournamentById = (id: string): TournamentDef => (id.startsWith('world:') ? worldDef(templateById(id.slice(6))) : TOURNAMENTS.find((t) => t.id === id)!);
export const entryCost = (t: TournamentDef) => t.buyIn + t.fee;

/** SNG 상금 비율: 2인 승자독식, 3~6인 65/35, 7~9인 60/30/10 */
export function sngShares(n: number): number[] { return n <= 2 ? [1] : n <= 6 ? [0.65, 0.35] : [0.6, 0.3, 0.1]; }
export function splitPool(pool: number, shares: number[]): number[] {
  const p = shares.map((s) => Math.floor(pool * s));
  p[0] += pool - p.reduce((a, b) => a + b, 0);
  return p;
}
/** 상금 풀: 참가비(수수료 제외) × 참가자 수. 프리롤은 하우스 보장액. NPC 참가비도 풀에 포함된다. */
export function prizePoolOf(t: TournamentDef, totalEntries = t.entrants): number { return t.guarantee ?? t.buyIn * totalEntries; }
export function sngPrizeTable(t: TournamentDef): number[] { return splitPool(prizePoolOf(t), sngShares(t.entrants)); }

export const levelDifficulty = (id: LevelId): Difficulty => AI_LEVELS.find((l) => l.id === id)!.difficulty;
