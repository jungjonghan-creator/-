import { describe, it, expect } from 'vitest';
import { allInLuck, quickCoach, deepReport } from '../src/analysis/coach';
import { reviewHand } from '../src/analysis/review';
import { applyAction, toHandRecord } from '../src/engine/game';
import { createRng } from '../src/engine/rng';
import { simulateAll, defaultAIs } from '../src/game/session';
import { mkGame, startRigged } from './helpers';

function shoveRecord(board: string) {
  const g = mkGame([1000, 1000]);
  let s = startRigged(g, ['As Ad', 'Kh Kd'], board);
  // 좌석0 이 AA. 둘 다 올인
  s = applyAction(s, { type: 'allin' }); s = applyAction(s, { type: 'allin' });
  const rec = toHandRecord(s);
  // 테스트에선 hero 를 좌석0 으로 간주해야 하므로 id 지정
  rec.startStacks[0].id = 'hero';
  return rec;
}

describe('올인 EV(운 보정)', () => {
  it('AA vs KK 프리플랍 올인: 승률≈82%, 이기면 운 +, 지면 운 −', () => {
    const win = allInLuck(shoveRecord('2c 7d 9h Js 3c'), 0, createRng(1), 6000);
    expect(win.applicable).toBe(true);
    expect(win.heroEquity).toBeGreaterThan(0.79); expect(win.heroEquity).toBeLessThan(0.85);
    expect(win.actual).toBe(1000);
    expect(win.expected).toBeGreaterThan(560); expect(win.expected).toBeLessThan(720);
    expect(win.luck).toBeGreaterThan(280);
    const lose = allInLuck(shoveRecord('Ac 7d 9h Kc Ks'), 0, createRng(1), 6000);
    expect(lose.applicable).toBe(true);
    expect(lose.actual).toBe(-1000);
    expect(lose.luck).toBeLessThan(-1500);
    // 기대값은 같은 올인에서 보드와 무관해야 한다
    expect(Math.abs(win.expected - lose.expected)).toBeLessThan(80);
  });
  it('폴드로 끝났거나 리버까지 간 핸드는 적용 안 함', () => {
    const g = mkGame([1000, 1000]);
    let s = startRigged(g, ['As Ad', 'Kh Kd'], '2c 7d 9h Js 3c');
    s = applyAction(s, { type: 'fold' });
    const rec = toHandRecord(s); rec.startStacks[0].id = 'hero';
    expect(allInLuck(rec, 0, createRng(1)).applicable).toBe(false);
  });
});

describe('핸드 직후 코치', () => {
  it('AA 올인이 졌을 때 "판단은 좋았고 운이 따르지 않았다" 로 안내', () => {
    const rec = shoveRecord('Ac 7d 9h Kc Ks');
    const rv = reviewHand(rec, 'hero', 600);
    const luck = allInLuck(rec, 0, createRng(2), 2500);
    const q = quickCoach(rec, rv, luck);
    expect(q.tone).toBe('luck');
    expect(q.headline).toContain('운');
    expect(q.points.join(' ')).toMatch(/올인 시점 내 승률/);
  });
});

describe('심층 분석 리포트', () => {
  it('시뮬레이션 세션에서 수치 일관성·누수/계획/상대 분석 생성', async () => {
    const s = simulateAll({ mode: 'cash', seats: 6, startBB: 100, bb: 100, speed: 'normal', humanName: 'TETO', ais: defaultAIs(5, 3), seed: 4 }, 150, { profileId: 'CallingStation', difficulty: 1 });
    const players = s.game.players.map((p, i) => ({ id: p.id, name: p.name, profileId: i === 0 ? 'CallingStation' : s.aiBySeat[i]?.profileId }));
    let lastP = 0;
    const r = await deepReport(s.records, players, { maxReviewHands: 60, sims: 150, onProgress: (p) => { lastP = p; } });
    expect(lastP).toBe(1);
    expect(r.totalHands).toBe(s.records.length);
    expect(r.analyzedHands).toBe(60);
    expect(Object.values(r.gradeDist).reduce((a, b) => a + b, 0)).toBeGreaterThan(30);
    expect(r.avgScore).not.toBeNull();
    expect(Number.isFinite(r.evLossBB)).toBe(true);
    expect(r.opponents.length).toBeGreaterThan(0);
    expect(r.plan.length).toBeGreaterThan(0);
    expect(r.summary).toMatch(/핸드/);
    expect(r.preflop.length).toBeGreaterThan(0);
    // 콜링스테이션 성향(VPIP 높음, PFR 낮음) 플레이어는 "콜/림프 위주" 또는 "너무 많은 핸드" 누수가 잡혀야 한다
    expect(r.leaks.some((l) => ['passive-pre', 'too-loose', 'overcall', 'overfold'].includes(l.id))).toBe(true);
    JSON.stringify(r); // 직렬화 가능
  }, 180000);
});
