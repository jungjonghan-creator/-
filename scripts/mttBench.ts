/** 개인 인스턴스 MTT 엔진(fast 테이블) 규모별 벤치마크: 시작 → 끝까지 진행 시간, 상태 JSON 크기, 칩 보존 */
import { newMTTSession, mttSimToEnd, chipTotal, mttAdvance } from '../src/game/mtt';
import { createRng } from '../src/engine/rng';
for (const n of [180, 1000, 5000, 10000]) {
  const s0 = newMTTSession({ startBB: 100, bb: 100, speed: 'normal', humanName: 'T', seed: 3, difficulty: 3, profileId: 'AdaptivePro', mtt: { entrants: n, tableSize: 9, buyIn: 1000, reentry: false, reentryUntilLevel: 0, maxReentries: 0, fast: true } });
  const kb = Math.round(JSON.stringify(s0).length / 1024);
  const rng = createRng(1);
  const t1 = Date.now(); const s1 = mttAdvance(s0, rng, 0.3, true); const oneRound = Date.now() - t1;
  const t = Date.now(); const s = mttSimToEnd(s1, rng);
  const m = s.mtt!;
  console.log(`${n}명: 상태 ${kb}KB, 1라운드 ${oneRound}ms, 전체 ${((Date.now() - t) / 1000).toFixed(1)}s, 라운드 ${m.round}, 칩보존 ${chipTotal(m) === m.totalEntries * m.startStack}, 우승 ${m.names[m.winner!]}`);
}
