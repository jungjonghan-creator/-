import { describe, it, expect } from 'vitest';
import { evaluate, categoryOf } from '../src/engine/evaluator';
import { createRng, shuffledDeck } from '../src/engine/rng';
import { rankOf, suitOf } from '../src/engine/cards';

// ── 독립 구현: 7장 중 5장 조합 21개를 전수 평가하는 단순 참조 평가기 ──
function ref5(cards: number[]): number[] {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = new Set(cards.map(suitOf)).size === 1;
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (JSON.stringify(ranks) === JSON.stringify([14, 5, 4, 3, 2])) straightHigh = 5;
  }
  const counts = new Map<number, number>();
  ranks.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join('');
  const byGroup = groups.map((g) => g[0]);
  if (straightHigh && flush) return [8, straightHigh];
  if (shape === '41') return [7, ...byGroup];
  if (shape === '32') return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (shape === '311') return [3, ...byGroup];
  if (shape === '221') return [2, ...byGroup];
  if (shape === '2111') return [1, ...byGroup];
  return [0, ...ranks];
}
const cmp = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d < 0 ? -1 : 1; } return 0; };
function combos<T>(a: T[], k: number): T[][] { if (k === 0) return [[]]; if (a.length < k) return []; const [h, ...t] = a; return [...combos(t, k - 1).map((c) => [h, ...c]), ...combos(t, k)]; }
const ref7 = (cards: number[]) => combos(cards, 5).map(ref5).reduce((best, x) => (cmp(x, best) > 0 ? x : best));

describe('평가기 교차검증', () => {
  it('독립 참조 구현과 20,000쌍의 승/무/패 판정이 모두 일치', () => {
    const rng = createRng(2024);
    let mismatches = 0;
    for (let i = 0; i < 20000; i++) {
      const d = shuffledDeck(rng);
      const board = d.slice(0, 5);
      const a = [...d.slice(5, 7), ...board], b = [...d.slice(7, 9), ...board];
      const mine = Math.sign(evaluate(a) - evaluate(b));
      const ref = cmp(ref7(a), ref7(b));
      if (mine !== ref) mismatches++;
    }
    expect(mismatches).toBe(0);
  }, 120000);
  it('7장 족보 분포가 알려진 확률과 일치 (300k 핸드, 허용오차)', () => {
    const rng = createRng(99);
    const N = 300000;
    const cnt = new Array(9).fill(0);
    for (let i = 0; i < N; i++) { const d = shuffledDeck(rng); cnt[categoryOf(evaluate(d.slice(0, 7)))]++; }
    const expected = [0.1741, 0.4383, 0.2350, 0.0483, 0.0462, 0.0303, 0.0260, 0.00168, 0.000311];
    expected.forEach((p, c) => {
      const got = cnt[c] / N;
      const se = Math.sqrt((p * (1 - p)) / N);
      expect(Math.abs(got - p), `category ${c}: got ${got.toFixed(5)} expected ${p}`).toBeLessThan(Math.max(5 * se, 0.0002));
    });
  }, 120000);
});
