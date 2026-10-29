/** 배치 시뮬레이터: 실력 반영도 + 규모별 소요시간 (docs/TEST_REPORT.md 에 기록) */
import { simulateBatch, SimEntrant } from '../src/world/batch';
import type { SkillProfile } from '../src/world/cast';
const mk = (v: number, risk = 55, agg = 55): SkillProfile => ({ preflop: v, postflop: v, icm: v, headsup: v, exploit: v, risk, adaptation: v, consistency: v, aggression: agg });
const field = (n: number, v = 55): SimEntrant[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, skill: mk(v + ((i * 7) % 11) - 5) }));
const sk = Number(process.argv[2] ?? 0);
if (sk) { // 실력 측정: 9인 SNG 1명(HI) vs 8명 평균 55
  for (const v of [25, 45, 65, 80, 92]) {
    let sum = 0, win = 0, ev = 0; const N = 600;
    for (let k = 0; k < N; k++) { const f = field(9); f[0] = { id: 'X', skill: mk(v) }; const r = simulateBatch({ entrants: f, startStack: 10000, bb0: 100, tableSize: 9, handsPerLevel: Number(process.argv[3] ?? 10), paidPlaces: 3, seed: 5000 + k }); const rk = r.order.findIndex((o) => o.pid === 'X'); sum += rk + 1; if (rk === 0) win++; ev += [0.5, 0.3, 0.2][rk] ?? 0; }
    console.log(`skill ${v}: 평균 순위 ${(sum / N).toFixed(2)} / 9, 우승 ${((win / N) * 100).toFixed(1)}% (기대 11.1%), 평균 상금 ${(ev / N * 9).toFixed(2)}배(바이인=1)`);
  }
}
for (const n of [180, 1000, 5000, 10000]) {
  const t = Date.now();
  const r = simulateBatch({ entrants: field(n), startStack: 10000, bb0: 100, tableSize: 9, handsPerLevel: 10, paidPlaces: Math.round(n * 0.15), seed: 7 });
  console.log(`${n}명: ${((Date.now() - t) / 1000).toFixed(1)}s, 라운드 ${r.rounds}, 핸드 ${r.hands}, 위반 ${r.violations.length}`);
}
