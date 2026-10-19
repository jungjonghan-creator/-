// 사용: npx tsx scripts/stress.ts [핸드수]  — 엔진 무작위 합법행동 대량 시뮬레이션 + AI 지연 측정
import { applyAction, checkInvariants, legalActions, startHand } from '../src/engine/game';
import { createRng } from '../src/engine/rng';
import { createGame, makePlayer } from '../src/engine/game';
import { decide } from '../src/ai/decide';
import { observe } from '../src/ai/observation';
import { Difficulty } from '../src/ai/profiles';
import { aiStep, beginHand, newSession, defaultAIs } from '../src/game/session';
import type { GameState } from '../src/engine/types';

const target = Number(process.argv[2] ?? 30000);
let hands = 0, actions = 0, allins = 0, sidepots = 0, splits = 0, seed = 1;
const t0 = Date.now();
while (hands < target) {
  const rng = createRng(seed++);
  const n = 2 + rng.int(8);
  const stacks = Array.from({ length: n }, () => 1000 + rng.int(40000));
  const total = stacks.reduce((a, b) => a + b, 0);
  let s: GameState = createGame({ sb: 50, bb: 100, ante: rng.int(2) * 10, maxSeats: 9 }, stacks.map((st, i) => makePlayer('p' + i, 'P' + i, st, false)), seed);
  for (let h = 0; h < 60; h++) {
    s = startHand(s, rng);
    if (s.gameOver) break;
    let guard = 0;
    while (s.street !== 'complete') {
      if (guard++ > 500) throw new Error('infinite loop');
      const la = legalActions(s)!;
      const r = rng.next();
      s = applyAction(s, r < 0.1 && la.canFold ? { type: 'fold' } : r < 0.5 && la.canCheck ? { type: 'check' } : r < 0.75 && la.canCall ? { type: 'call' } : la.canRaise ? (rng.next() < 0.2 ? { type: 'allin' } : { type: la.isBet ? 'bet' : 'raise', to: la.minTo + rng.int(la.maxTo - la.minTo + 1) }) : la.canCheck ? { type: 'check' } : { type: 'call' });
      actions++;
      const errs = checkInvariants(s);
      if (errs.length) throw new Error(errs.join());
    }
    if (s.players.reduce((t, p) => t + p.stack, 0) !== total) throw new Error('chip total changed');
    if (s.players.some((p) => p.stack < 0)) throw new Error('negative stack');
    if (s.result!.pots.length > 1) sidepots++;
    if (s.result!.pots.some((p) => p.winners.length > 1)) splits++;
    if (s.players.some((p) => p.allIn)) allins++;
    hands++;
  }
}
console.log(`ENGINE: ${hands} hands, ${actions} actions, ${allins} all-in hands, ${sidepots} multi-pot hands, ${splits} split-pot hands — 0 invariant violations (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// AI 지연 측정 (플랍 이후 의사결정 위주)
for (const d of [1, 3, 5] as Difficulty[]) {
  let sess = newSession({ mode: 'cash', seats: 6, startBB: 100, bb: 100, speed: 'normal', humanName: 'X', ais: defaultAIs(5, d), seed: 3 });
  sess.game.players[0].isHuman = false; sess = { ...sess, aiBySeat: { ...sess.aiBySeat, 0: { profileId: 'Balanced', difficulty: d } } };
  const rng = createRng(77);
  const times: number[] = [];
  for (let h = 0; h < 120; h++) {
    sess = beginHand(sess, rng);
    while (sess.game.toAct !== null) {
      const g = sess.game; const seat = g.toAct!;
      const obs = observe(g, seat);
      const t = performance.now();
      decide(obs, sess.aiBySeat[seat], sess.memory, createRng(h * 31 + g.events.length), 1);
      times.push(performance.now() - t);
      sess = aiStep(sess).sess;
    }
  }
  times.sort((a, b) => a - b);
  const q = (p: number) => times[Math.floor(times.length * p)].toFixed(1);
  console.log(`AI d${d}: ${times.length} decisions, median ${q(0.5)}ms, p95 ${q(0.95)}ms, max ${times[times.length - 1].toFixed(1)}ms`);
}
