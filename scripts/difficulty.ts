// 난이도 우열 대표본 검증: 같은 성향(TAG), 다른 난이도, 헤즈업 + 6-max
import { Difficulty } from '../src/ai/profiles';
import { simulateAll, SessionConfig } from '../src/game/session';
const hands = Number(process.argv[2] ?? 8000);
const pairs: [Difficulty, Difficulty][] = [[5, 1], [3, 1], [5, 3], [4, 2]];
for (const [a, b] of pairs) {
  const nets: number[] = [];
  for (let seed = 1; seed <= 4; seed++) {
    const cfg: SessionConfig = { mode: 'cash', seats: 2, startBB: 100, bb: 100, speed: 'normal', humanName: 'X', ais: [{ profileId: 'TAG', difficulty: b }], seed };
    const s = simulateAll(cfg, hands / 4, { profileId: 'TAG', difficulty: a });
    let net = 0, n = 0;
    for (const r of s.records) { const seat = r.startStacks.find((x) => x.id === 'hero')!.seat; net += r.result!.net[seat] ?? 0; n++; }
    nets.push(net / 100 / n * 100);
  }
  const mean = nets.reduce((x, y) => x + y) / nets.length;
  const sd = Math.sqrt(nets.reduce((x, y) => x + (y - mean) ** 2, 0) / (nets.length - 1));
  console.log(`d${a} vs d${b}: ${mean.toFixed(1)} BB/100  (4 blocks: ${nets.map((x) => x.toFixed(0)).join(', ')}; SE≈${(sd / 2).toFixed(1)})`);
}
