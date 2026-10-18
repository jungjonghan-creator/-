// 사용: npm run sim  — 성향별 통계, 난이도별 승률(BB/100)을 출력한다.
import { PROFILE_IDS, AISetup, Difficulty } from '../src/ai/profiles';
import { emptyStats, Stats, updateModel } from '../src/ai/opponentModel';
import { simulateAll, SessionConfig, Session } from '../src/game/session';

const cfg = (seats: number, ais: AISetup[], seed: number, startBB: number): SessionConfig =>
  ({ mode: 'cash', seats, startBB, bb: 100, speed: 'normal', humanName: 'X', ais, seed });
const stats = (s: Session, id: string): Stats => { const m: Record<string, Stats> = {}; for (const r of s.records) updateModel(m, r); return m[id] ?? emptyStats(); };
const hands = Number(process.argv[2] ?? 1500);

console.log(`\n== 성향별 통계 (6-max, 상대=Balanced d3 ×5, ${hands}핸드) ==`);
const rows: Record<string, any> = {};
for (const p of PROFILE_IDS) {
  const s = simulateAll(cfg(6, Array(5).fill({ profileId: 'Balanced', difficulty: 3 }), 11, 200), hands, { profileId: p, difficulty: 3 });
  const st = stats(s, 'hero');
  const f = (a: number, b: number) => (b ? (100 * a / b).toFixed(1) + '%' : '-');
  rows[p] = { hands: st.hands, VPIP: f(st.vpip, st.hands), PFR: f(st.pfr, st.hands), '3bet': f(st.tb, st.tbOpp), Cbet: f(st.cb, st.cbOpp), FoldToCbet: f(st.fcb, st.fcbOpp), AF: f(st.aggr, st.aggr + st.passive), WTSD: f(st.wtsd, st.sawFlop) };
}
console.table(rows);

console.log(`\n== 난이도 강도 (헤즈업, TAG 동일 성향, 100BB 캐시, ${hands}핸드) ==`);
const drows: Record<string, any> = {};
for (const [a, b] of [[5, 1], [5, 3], [4, 2], [3, 1]] as [Difficulty, Difficulty][]) {
  const s = simulateAll(cfg(2, [{ profileId: 'TAG', difficulty: b }], 5, 100), hands, { profileId: 'TAG', difficulty: a });
  // 캐시 AI 자동 리바이로 핸드별 손익은 records 의 net 합으로 계산
  let net = 0, n = 0;
  for (const r of s.records) { const seat = r.startStacks.find((x) => x.id === 'hero')!.seat; net += r.result!.net[seat] ?? 0; n++; }
  drows[`d${a} vs d${b}`] = { hands: n, 'BB/100(앞쪽)': (net / 100 / n * 100).toFixed(1) };
}
console.table(drows);
