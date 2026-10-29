import { describe, expect, it } from 'vitest';
import { simulateBatch, SimEntrant, BatchSpec } from '../src/world/batch';
import type { SkillProfile } from '../src/world/cast';

const mk = (v: number, risk = 55, agg = 55): SkillProfile => ({ preflop: v, postflop: v, icm: v, headsup: v, exploit: v, risk, adaptation: v, consistency: v, aggression: agg });
const field = (n: number, v = 60): SimEntrant[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, skill: mk(v + ((i * 7) % 11) - 5) }));
const spec = (entrants: SimEntrant[], extra: Partial<BatchSpec> = {}): BatchSpec => ({ entrants, startStack: 10000, bb0: 100, tableSize: 9, handsPerLevel: 10, paidPlaces: Math.max(1, Math.round(entrants.length * 0.15)), seed: 1, ...extra });

describe('배치 시뮬레이터', () => {
  it('9명 SNG: 칩 보존, 순위는 전원 1회씩, 결정론적', () => {
    const r1 = simulateBatch(spec(field(9)));
    const r2 = simulateBatch(spec(field(9)));
    expect(r1.violations).toEqual([]);
    expect(r1.order.length).toBe(9);
    expect(new Set(r1.order.map((o) => o.eid)).size).toBe(9);
    expect(r1.order).toEqual(r2.order);
    expect(r1.rounds).toBeGreaterThan(5);
    expect(r1.rounds).toBeLessThan(4000);
  });
  it('180명 MTT: 모든 핸드 칩 보존', () => {
    const r = simulateBatch(spec(field(180)));
    expect(r.violations).toEqual([]);
    expect(r.order.length).toBe(180);
    expect(r.chipTotal).toBe(1800000);
  });
  it('PKO: 바운티 보존', () => {
    const r = simulateBatch(spec(field(90), { bounty: { share: 0.5 } }));
    expect(r.violations).toEqual([]);
    const cash = Object.values(r.bountyCash).reduce((a, b) => a + b, 0);
    expect(cash + r.winnerBounty).toBe(r.bountyUnit * r.totalEntries);
  });
  it('재진입: 엔트리 수 증가 + 칩/순위 일관', () => {
    const r = simulateBatch(spec(field(60), { reentry: { untilLevel: 4, max: 2 } }));
    expect(r.violations).toEqual([]);
    expect(r.totalEntries).toBeGreaterThan(60);
    expect(r.order.length).toBe(r.totalEntries);
    expect(r.chipTotal).toBe(r.totalEntries * 10000);
  });
  it('실력 차이가 결과에 반영된다 (고수 1명 + 약한 필드 반복)', () => {
    let hi = 0, lo = 0; const N = 80;
    for (let k = 0; k < N; k++) {
      const f = field(9, 45);
      f[0] = { id: 'HI', skill: mk(92, 55, 60) };
      f[1] = { id: 'LO', skill: mk(25, 55, 60) };
      const r = simulateBatch(spec(f, { seed: 100 + k }));
      const rank = (id: string) => r.order.findIndex((o) => o.pid === id);
      hi += rank('HI'); lo += rank('LO');
    }
    expect(hi / N).toBeLessThan(lo / N); // 평균 순위(작을수록 상위)
  });
  it('벤치마크 스모크: 1000명', () => {
    const t = Date.now();
    const r = simulateBatch(spec(field(1000)));
    expect(r.violations).toEqual([]);
    expect(r.order.length).toBe(1000);
    console.log('1000명 소요(ms):', Date.now() - t, '라운드', r.rounds, '핸드', r.hands);
  }, 120000);
});
