import { describe, it, expect } from 'vitest';
import { decide } from '../src/ai/decide';
import { observe } from '../src/ai/observation';
import { applyAction, legalActions, startHand, startHandWithDeck } from '../src/engine/game';
import { createRng, shuffledDeck } from '../src/engine/rng';
import { mkGame } from './helpers';
import { Difficulty } from '../src/ai/profiles';

// 플랍에서 상대가 ½팟 벳 → AI 가 직면하는 상황을 엔진으로 생성
function facingBetObs(seed: number) {
  const base = mkGame([10000, 10000]);
  let g = startHandWithDeck(base, shuffledDeck(createRng(seed)), 1);
  while (g.street === 'preflop') g = applyAction(g, legalActions(g)!.canCheck ? { type: 'check' } : { type: 'call' });
  const la = legalActions(g)!;
  g = applyAction(g, { type: 'bet', to: Math.max(la.minTo, Math.round(la.pot / 2)) });
  return observe(g, g.toAct!);
}

describe('난이도에 따른 전략 차이', () => {
  const spread = (d: Difficulty) => {
    let flips = 0, total = 0;
    for (let s = 1; s <= 60; s++) {
      const obs = facingBetObs(s);
      const acts = new Set<string>();
      for (let k = 0; k < 15; k++) acts.add(decide(obs, { profileId: 'Balanced', difficulty: d }, {}, createRng(k * 101 + s), 1).action.type);
      flips += acts.size > 1 ? 1 : 0; total++;
    }
    return flips / total;
  };
  it('초급은 같은 상황에서 결정이 더 불안정하고(노이즈·실수), 고급은 일관적이다', () => {
    const d1 = spread(1), d5 = spread(5);
    console.log('decision instability d1/d5:', d1.toFixed(2), d5.toFixed(2));
    expect(d1).toBeGreaterThan(d5);
  });
  it('난이도별 몬테카를로 횟수/오차 수치가 단조롭게 강해진다', async () => {
    const { SKILLS } = await import('../src/ai/profiles');
    for (let d = 1; d < 5; d++) {
      expect(SKILLS[(d + 1) as Difficulty].sims).toBeGreaterThan(SKILLS[d as Difficulty].sims);
      expect(SKILLS[(d + 1) as Difficulty].noise).toBeLessThan(SKILLS[d as Difficulty].noise);
      expect(SKILLS[(d + 1) as Difficulty].mistake).toBeLessThan(SKILLS[d as Difficulty].mistake);
    }
  });
});

describe('탈락과 인원 감소', () => {
  it('올인 패배한 플레이어는 탈락 처리되고 다음 핸드는 남은 인원으로 진행', () => {
    const g0 = mkGame([300, 5000, 5000], { sb: 50, bb: 100, ante: 0, maxSeats: 9 });
    // 반복 시도: 좌석0 이 올인으로 지는 시드를 찾는다
    for (let seed = 1; seed < 300; seed++) {
      let g = startHand(g0, createRng(seed));
      let guard = 0;
      while (g.street !== 'complete' && guard++ < 50) {
        const la = legalActions(g)!;
        if (g.toAct === 0) g = applyAction(g, { type: 'allin' });
        else g = applyAction(g, la.canCheck ? { type: 'check' } : { type: 'call' });
      }
      if (g.players[0].stack === 0) {
        expect(g.players[0].busted).toBe(true);
        expect(g.players[0].finishPlace).toBe(3);
        const n = startHand(g, createRng(seed + 1));
        expect(n.players.filter((p) => p.inHand).length).toBe(2);
        expect(n.players[0].inHand).toBe(false);
        // 2인 남으면 헤즈업 규칙 적용 (버튼=SB)
        expect(n.sbSeat).toBe(n.button);
        return;
      }
    }
    throw new Error('no bust scenario found');
  });
});
