// 듀플리케이트 헤즈업: 같은 52장 덱을 좌석(포지션)만 바꿔 두 번 플레이 → 카드 운이 상쇄되어 실력 차이를 훨씬 적은 표본으로 측정
// 사용: npx tsx scripts/duplicate.ts [딜 수=4000]  (각 대결은 매 핸드 100BB 스택, 상대 기억 없음 = 비적응 기본 실력 측정)
import { decide } from '../src/ai/decide';
import { observe } from '../src/ai/observation';
import { AISetup } from '../src/ai/profiles';
import { applyAction, createGame, makePlayer, startHandWithDeck } from '../src/engine/game';
import { createRng, shuffledDeck } from '../src/engine/rng';

function playHand(deck: number[], setups: [AISetup, AISetup], seed: number): [number, number] {
  const g0 = createGame({ sb: 50, bb: 100, ante: 0, maxSeats: 2 }, [makePlayer('a', 'A', 10000, false), makePlayer('b', 'B', 10000, false)], 1);
  let g = startHandWithDeck(g0, deck, seed, 0);
  let guard = 0;
  while (g.street !== 'complete') {
    if (guard++ > 300) throw new Error('loop');
    const seat = g.toAct!;
    const obs = observe(g, seat);
    const d = decide(obs, setups[seat], {}, createRng((seed * 7919 + g.events.length * 104729 + seat * 31) >>> 0), 1);
    try { g = applyAction(g, d.action); } catch { g = applyAction(g, obs.legal.canCheck ? { type: 'check' } : { type: 'fold' }); }
  }
  return [g.result!.net[0] ?? 0, g.result!.net[1] ?? 0];
}

const deals = Number(process.argv[2] ?? 4000);
const A = (d: number): AISetup => ({ profileId: 'AdaptivePro', difficulty: d as 2 | 3 | 4 | 5 });
const pairs: [number, number][] = [[3, 2], [4, 3], [5, 4], [5, 2]];
for (const [a, b] of pairs) {
  const rng = createRng(1000 + a * 10 + b);
  const per: number[] = [];
  for (let i = 0; i < deals; i++) {
    const deck = shuffledDeck(rng);
    const r1 = playHand(deck, [A(a), A(b)], i * 2 + 1);   // A 가 SB(버튼)
    const r2 = playHand(deck, [A(b), A(a)], i * 2 + 2);   // 같은 카드, 좌석 교환: A 가 BB
    per.push((r1[0] + r2[1]) / 100 / 2);                  // 두 핸드의 평균 BB
  }
  const mean = per.reduce((x, y) => x + y) / per.length;
  const sd = Math.sqrt(per.reduce((x, y) => x + (y - mean) ** 2, 0) / (per.length - 1));
  console.log(`d${a} vs d${b}: ${(mean * 100).toFixed(1)} BB/100 ± ${((sd / Math.sqrt(per.length)) * 100).toFixed(1)}  (${deals}딜 = ${deals * 2}핸드)`);
}
