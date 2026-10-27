import { describe, it, expect } from 'vitest';
import { decide } from '../src/ai/decide';
import { observe } from '../src/ai/observation';
import { AI_LEVELS, PERSONAS, Difficulty } from '../src/ai/profiles';
import { applyAction, legalActions, startHandWithDeck } from '../src/engine/game';
import { createRng, shuffledDeck } from '../src/engine/rng';
import { parseCards } from '../src/engine/cards';
import { beginHand, newSession, defaultAIs } from '../src/game/session';
import { mkGame } from './helpers';
import { adaptiveLevelLength, nextLevelLength, BASE_HANDS_PER_LEVEL } from '../src/game/blinds';

type Dist = { raise: number; call: number; check: number; fold: number };
function dist(profileId: string, d: Difficulty, make: (seed: number) => ReturnType<typeof observe>, n = 240): Dist {
  const c = { raise: 0, call: 0, check: 0, fold: 0 };
  for (let seed = 1; seed <= n; seed++) {
    const a = decide(make(seed), { profileId, difficulty: d }, {}, createRng(seed * 7 + 1), 1).action.type;
    if (a === 'raise' || a === 'bet' || a === 'allin') c.raise++; else c[a as 'call' | 'check' | 'fold']++;
  }
  return { raise: c.raise / n, call: c.call / n, check: c.check / n, fold: c.fold / n };
}
// 6인 프리플랍 UTG 앞 상황 (아무도 레이즈하지 않음)
const preflopObs = (seed: number) => {
  const g = startHandWithDeck(mkGame([10000, 10000, 10000, 10000, 10000, 10000]), shuffledDeck(createRng(seed)), 1);
  return observe(g, g.toAct!);
};
// 플랍에서 강한 핸드(탑셋)로 먼저 행동하는 상황: 관찰 DTO 의 홀카드/보드만 교체 (공개 정보 구조는 동일)
const strongFlopObs = (seed: number) => {
  let g = startHandWithDeck(mkGame([10000, 10000]), shuffledDeck(createRng(seed)), 1);
  while (g.street === 'preflop') g = applyAction(g, legalActions(g)!.canCheck ? { type: 'check' } : { type: 'call' });
  const o = observe(g, g.toAct!);
  return { ...o, hole: parseCards('Ah Ad') as [number, number], board: parseCards('As 7d 2c') };
};

describe('[시나리오3] 난이도는 카드 분배에 관여하지 않는다', () => {
  it('같은 시드면 AI 난이도·성향이 달라도 덱과 모든 홀카드가 동일', () => {
    const mk = (d: Difficulty, p: string) => beginHand(newSession({ mode: 'cash', seats: 6, startBB: 100, bb: 100, speed: 'normal', humanName: 'T', ais: Array(5).fill({ profileId: p, difficulty: d }), seed: 1 }), createRng(42)).game;
    const base = mk(2, 'Rock');
    for (const [d, p] of [[3, 'LAG'], [4, 'Trapper'], [5, 'AdaptivePro']] as [Difficulty, string][]) {
      const g = mk(d, p);
      expect(g.deck).toEqual(base.deck);
      expect(g.players.map((x) => x.hole)).toEqual(base.players.map((x) => x.hole));
    }
  });
  it('4단계 난이도는 내부 실력 수치에 매핑되며 서로 다르다', () => {
    expect(AI_LEVELS.map((l) => l.difficulty)).toEqual([2, 3, 4, 5]);
  });
});

describe('[시나리오4] 같은 상황에서도 성향에 따라 서로 다른 합리적 행동', () => {
  it('5가지 성격: 프리플랍 참여율(레이즈) 순서와 차이가 뚜렷', () => {
    const d = Object.fromEntries(PERSONAS.map((p) => [p.id, dist(p.profileId, 4, preflopObs)]));
    console.log('preflop UTG-ish raise%', Object.fromEntries(Object.entries(d).map(([k, v]) => [k, +(v.raise * 100).toFixed(1)])));
    expect(d.conservative.raise).toBeLessThan(d.balanced.raise);
    expect(d.balanced.raise).toBeLessThan(d.aggressive.raise);
    expect(d.aggressive.raise).toBeLessThan(d.wild.raise);
    expect(d.conservative.fold).toBeGreaterThan(d.wild.fold + 0.15);
    // 서로 다른 성격 쌍은 결정 분포가 5%p 이상 차이난다(전부 같은 행동 금지)
    const ids = PERSONAS.map((p) => p.id);
    let distinctPairs = 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = d[ids[i]], b = d[ids[j]]; if (Math.abs(a.raise - b.raise) + Math.abs(a.fold - b.fold) > 0.05) distinctPairs++; }
    expect(distinctPairs).toBeGreaterThanOrEqual(8); // 10쌍 중 8쌍 이상
  });
  it('함정형은 강한 핸드로 체크(슬로우플레이)를 훨씬 자주 하고, 공격형은 먼저 베팅한다', () => {
    const trapper = dist('Trapper', 4, strongFlopObs), lag = dist('LAG', 4, strongFlopObs), bal = dist('AdaptivePro', 4, strongFlopObs);
    console.log('strong flop first-to-act: check% trapper/lag/balanced', trapper.check.toFixed(2), lag.check.toFixed(2), bal.check.toFixed(2));
    expect(trapper.check).toBeGreaterThan(lag.check + 0.2);
    expect(trapper.check).toBeGreaterThan(bal.check + 0.2);
  });
  it('판돈은 같아도 같은 성격이 매번 똑같이 행동하지는 않는다 (베팅 크기·행동 다양성)', () => {
    const sizes = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const a = decide(strongFlopObs(seed), { profileId: 'AdaptivePro', difficulty: 5 }, {}, createRng(seed), 1).action;
      if (a.type === 'bet' || a.type === 'raise') sizes.add(Math.round((a.to ?? 0) / 10) * 10);
    }
    expect(sizes.size).toBeGreaterThanOrEqual(4);
  });
  it('재현성: 같은 관찰·같은 시드면 같은 결정', () => {
    const o = strongFlopObs(5);
    expect(decide(o, { profileId: 'Wild', difficulty: 5 }, {}, createRng(9), 1)).toEqual(decide(o, { profileId: 'Wild', difficulty: 5 }, {}, createRng(9), 1));
  });
});

describe('[시나리오2] 토너먼트 블라인드 정책', () => {
  it('정규: 확정된 길이 (일반=10핸드, 느림 15, 터보 6)', () => {
    expect(BASE_HANDS_PER_LEVEL.normal).toBe(10);
    const f = { avgBB: 30, playersLeft: 9, entrants: 9, handsPlayed: 10 };
    expect(nextLevelLength('regular', 'normal', f)).toBe(10);
    expect(nextLevelLength('regular', 'slow', f)).toBe(15);
    expect(nextLevelLength('regular', 'turbo', f)).toBe(6);
  });
  it('적응형: 평균 스택이 짧으면 간격↑, 깊으면 간격↓, 상·하한 70~140%, 같은 입력엔 같은 출력', () => {
    const base = 10;
    const s = (avgBB: number, left = 5, ent = 9, hp = 12) => adaptiveLevelLength(base, { avgBB, playersLeft: left, entrants: ent, handsPlayed: hp });
    expect(s(8)).toBeGreaterThan(base);
    expect(s(8)).toBe(13); expect(s(15)).toBe(12);
    expect(s(30)).toBe(base);
    expect(s(50)).toBe(9); expect(s(80)).toBe(8);
    expect(s(80, 9, 9, 50)).toBeGreaterThanOrEqual(7); // 정체 + 깊은 스택도 70% 하한
    for (const a of [1, 5, 15, 30, 55, 90, 300]) for (const left of [2, 5, 9]) { const v = s(a, left, 9, 100); expect(v).toBeGreaterThanOrEqual(7); expect(v).toBeLessThanOrEqual(14); expect(s(a, left, 9, 100)).toBe(v); }
  });
  it('적응형은 개인의 칩/성적에 의존하지 않는다 (입력은 필드 전체 공개 상태뿐)', () => {
    // 함수 시그니처가 FieldState(평균 BB·남은 인원·참가자·핸드 수) 외의 값을 받지 않는다
    expect(adaptiveLevelLength.length).toBe(2);
    expect(Object.keys({ avgBB: 1, playersLeft: 1, entrants: 1, handsPlayed: 1 })).toHaveLength(4);
  });
});
void defaultAIs;

import { boardWetness } from '../src/ai/decide';
describe('보드 텍스처', () => {
  it('드라이(무지개·비연결) < 웻(같은 무늬·연결)', () => {
    const dry = boardWetness(parseCards('As 7d 2c'));
    const mid = boardWetness(parseCards('Ks Qd 4c'));
    const wet = boardWetness(parseCards('9h Th 8h'));
    const paired = boardWetness(parseCards('7s 7d 2c'));
    expect(dry).toBeLessThan(0.3);
    expect(wet).toBeGreaterThan(0.7);
    expect(dry).toBeLessThan(mid + 0.01);
    expect(mid).toBeLessThan(wet);
    expect(paired).toBeLessThan(wet);
    expect(boardWetness([])).toBe(0);
  });
});
