import { Speed } from './session';

/** 규모가 점점 커지는 토너먼트 래더. 이전 단계에서 입상(ITM)하면 다음 단계가 열린다. */
export interface Tier {
  id: string;
  name: string;
  kind: 'hu' | 'sng' | 'mtt';
  entrants: number;
  tableSize: 2 | 6 | 9;
  startBB: number;
  bb: number;
  speed: Speed;
  buyIn: number;
  /** MTT 전용 */
  lateRegUntilLevel?: number;
  lateRegPerRound?: number;
  aiReentry?: boolean;
  reentry?: boolean;
  desc: string;
}

export const TIERS: Tier[] = [
  { id: 'hu', name: '헤즈업 SNG', kind: 'hu', entrants: 2, tableSize: 2, startBB: 30, bb: 100, speed: 'turbo', buyIn: 50, desc: '1:1. 블라인드가 빠르게 올라 스택이 곧 20BB 아래로 내려갑니다.' },
  { id: 'sng6', name: '6인 SNG', kind: 'sng', entrants: 6, tableSize: 6, startBB: 40, bb: 100, speed: 'turbo', buyIn: 100, desc: '1~2위 입상. 버블이 곧 3위 → 위험한 구간이 빨리 옵니다.' },
  { id: 'sng9', name: '9인 SNG', kind: 'sng', entrants: 9, tableSize: 9, startBB: 50, bb: 100, speed: 'turbo', buyIn: 100, desc: '1~3위 입상. 앤티가 붙는 중반부터 압박이 시작됩니다.' },
  { id: 'mtt27', name: '로컬 MTT 27', kind: 'mtt', entrants: 27, tableSize: 9, startBB: 50, bb: 100, speed: 'hyper', buyIn: 100, desc: '3개 테이블에서 시작해 테이블이 합쳐지며 파이널 테이블까지.' },
  { id: 'mtt54', name: '데일리 MTT 54+', kind: 'mtt', entrants: 54, tableSize: 9, startBB: 50, bb: 100, speed: 'hyper', buyIn: 100, lateRegUntilLevel: 3, lateRegPerRound: 0.8, aiReentry: true, reentry: true, desc: '레이트 등록으로 참가자가 늘고, 탈락자가 재진입합니다. 6개 이상의 테이블.' },
  { id: 'mtt108', name: '위크엔드 MTT 108+', kind: 'mtt', entrants: 108, tableSize: 9, startBB: 75, bb: 100, speed: 'turbo', buyIn: 200, lateRegUntilLevel: 4, lateRegPerRound: 1.2, aiReentry: true, reentry: true, desc: '12개 테이블로 시작. 입상 인원이 늘고 버블이 길게 이어집니다.' },
  { id: 'mtt216', name: '메인 이벤트 216+', kind: 'mtt', entrants: 216, tableSize: 9, startBB: 100, bb: 100, speed: 'turbo', buyIn: 500, lateRegUntilLevel: 5, lateRegPerRound: 1.6, aiReentry: true, reentry: true, desc: '24개 테이블, 깊은 스택. 우승까지 가장 긴 여정입니다.' },
];

export const tierById = (id: string) => TIERS.find((t) => t.id === id) ?? TIERS[0];

export interface TierRecord { tierId?: string; place: number; prize: number; entrants: number; date: number }

/** 해금 규칙: 첫 티어는 항상 열림, 이후는 이전 티어에서 입상(prize>0)해야 열림 */
export function unlockedTiers(results: TierRecord[]): number {
  let n = 1;
  for (let i = 0; i < TIERS.length - 1; i++) {
    if (results.some((r) => r.tierId === TIERS[i].id && r.prize > 0)) n = i + 2; else break;
  }
  return n;
}
export function bestFinish(results: TierRecord[], id: string): { place: number; entrants: number } | null {
  const rs = results.filter((r) => r.tierId === id);
  if (!rs.length) return null;
  const b = rs.reduce((a, c) => (c.place / c.entrants < a.place / a.entrants ? c : a));
  return { place: b.place, entrants: b.entrants };
}
