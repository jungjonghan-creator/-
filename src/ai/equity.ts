import { Card } from '../engine/cards';
import { evaluate } from '../engine/evaluator';
import { RNG } from '../engine/rng';
import { handKey } from './handKey';
import { PREFLOP_PCT } from './preflopTable';

export const holePct = (a: Card, b: Card) => PREFLOP_PCT[handKey(a, b)];

/**
 * 몬테카를로 승률 추정. 알려진 카드(내 홀카드+공개 보드)만 입력받고,
 * 상대 핸드는 "상위 pct 이내" 범위에서 무작위 표본 추출한다. 실제 덱을 읽지 않는다.
 * 반환: 모든 상대에 대한 승률(무승부는 분할)
 */
export interface OppRange { pct: number; /** 현재 보드에서 메이드핸드 강도 상위 비율 (1=제한 없음) */ boardTop: number }

export function estimateEquity(hole: [Card, Card], board: Card[], oppRanges: (number | OppRange)[], sims: number, rng: RNG): number {
  const ranges: OppRange[] = oppRanges.map((r) => (typeof r === 'number' ? { pct: r, boardTop: 1 } : r));
  const oppPcts = ranges.map((r) => r.pct);
  const known = new Set<Card>([...hole, ...board]);
  const pool: Card[] = [];
  for (let i = 0; i < 52; i++) if (!known.has(i)) pool.push(i);
  const need = 5 - board.length;
  let total = 0;
  const nOpp = oppPcts.length;
  if (nOpp === 0) return 1;
  // 보드 기준 강도 임계값: 임의 핸드 표본의 분위수 (보드가 있을 때만)
  const thresholds: number[] = ranges.map(() => -1);
  if (board.length >= 3 && ranges.some((r) => r.boardTop < 1)) {
    const sample: number[] = [];
    for (let i = 0; i < 160; i++) {
      const a = pool[rng.int(pool.length)], b = pool[rng.int(pool.length)];
      if (a !== b) sample.push(evaluate([a, b, ...board]));
    }
    sample.sort((x, y) => x - y);
    ranges.forEach((r, i) => { if (r.boardTop < 1) thresholds[i] = sample[Math.min(sample.length - 1, Math.floor((1 - r.boardTop) * sample.length))]; });
  }
  for (let n = 0; n < sims; n++) {
    // 부분 셔플: 상대 핸드 후보 → 보드
    const used = new Set<number>();
    const oppHands: [Card, Card][] = [];
    let ok = true;
    for (let o = 0; o < nOpp; o++) {
      let chosen: [Card, Card] | null = null;
      for (let tries = 0; tries < 40; tries++) {
        const a = pool[rng.int(pool.length)], b = pool[rng.int(pool.length)];
        if (a === b || used.has(a) || used.has(b)) continue;
        if (oppPcts[o] < 0.999 && holePct(a, b) > oppPcts[o]) continue;
        // 보드 강도 필터 (12% 는 블러프/드로우로 통과)
        if (thresholds[o] >= 0 && evaluate([a, b, ...board]) < thresholds[o] && rng.next() > 0.12) continue;
        chosen = [a, b]; break;
      }
      if (!chosen) { // 범위 샘플 실패 → 가능한 아무 핸드
        for (;;) { const a = pool[rng.int(pool.length)], b = pool[rng.int(pool.length)]; if (a !== b && !used.has(a) && !used.has(b)) { chosen = [a, b]; break; } }
      }
      used.add(chosen[0]); used.add(chosen[1]); oppHands.push(chosen);
    }
    const bd = [...board];
    while (bd.length < 5) { const c = pool[rng.int(pool.length)]; if (!used.has(c)) { used.add(c); bd.push(c); } }
    void need;
    const mine = evaluate([...hole, ...bd]);
    let best = -1, tied = 0;
    for (const [a, b] of oppHands) {
      const sc = evaluate([a, b, ...bd]);
      if (sc > best) { best = sc; tied = 1; } else if (sc === best) tied++;
    }
    if (mine > best) total += 1; else if (mine === best) total += 1 / (tied + 1);
  }
  return total / sims;
}
