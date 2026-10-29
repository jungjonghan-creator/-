import { describe, expect, it } from 'vitest';
import { newMTTSession, mttAdvance, mttSimToEnd, chipTotal, MTTState, heroBountyCash } from '../src/game/mtt';
import { createRng } from '../src/engine/rng';

const mk = (entrants: number, extra: Partial<MTTState['config']> = {}) => newMTTSession({
  startBB: 50, bb: 100, speed: 'turbo', humanName: 'TETO', seed: 11, difficulty: 3, profileId: 'AdaptivePro',
  mtt: { entrants, tableSize: 9, buyIn: 1000, reentry: false, reentryUntilLevel: 0, maxReentries: 0, fast: true, ...extra },
});

describe('대규모 MTT (배치 테이블)', () => {
  it('360명 PKO: 끝까지 진행, 칩 보존, 순위 유일, 바운티 보존', () => {
    let s = mk(360, { bounty: { share: 0.5 } });
    const total0 = chipTotal(s.mtt!);
    const unit = s.mtt!.bounty!.unit;
    expect(total0).toBe(360 * 2500 * 2); // startBB 50 × bb 100 = 5000 칩
    const rng = createRng(5);
    const t = Date.now();
    s = mttSimToEnd(s, rng);
    const m = s.mtt!;
    expect(m.finished).toBe(true);
    expect(chipTotal(m)).toBe(total0);
    expect(new Set(Object.values(m.places)).size).toBe(Object.keys(m.places).length);
    expect(m.places[m.winner!]).toBe(1);
    const cash = Object.values(m.bounty!.cash).reduce((a, b) => a + b, 0);
    const live = Object.values(m.bounty!.cur).reduce((a, b) => a + b, 0);
    expect(cash + live).toBe(unit * 360);
    expect(heroBountyCash(m)).toBeGreaterThanOrEqual(0);
    console.log('360명 PKO 시뮬레이션 ms:', Date.now() - t, '라운드', m.round);
  }, 120000);
  it('미스터리 바운티: 평균 약 1배, 보존', () => {
    let s = mk(180, { bounty: { share: 0.5, mystery: true } });
    const pool0 = Object.values(s.mtt!.bounty!.cur).reduce((a, b) => a + b, 0);
    expect(pool0 / (180 * s.mtt!.bounty!.unit)).toBeGreaterThan(0.6);
    expect(pool0 / (180 * s.mtt!.bounty!.unit)).toBeLessThan(1.5);
    s = mttSimToEnd(s, createRng(3));
    const m = s.mtt!;
    expect(Object.values(m.bounty!.cash).reduce((a, b) => a + b, 0) + Object.values(m.bounty!.cur).reduce((a, b) => a + b, 0)).toBe(pool0);
  }, 120000);
  it('레이트 등록 + AI 재진입이 있는 대규모 MTT도 칩 보존', () => {
    let s = mk(200, { lateRegUntilLevel: 4, lateRegPerRound: 2, aiReentry: true, reentry: true, reentryUntilLevel: 4, maxReentries: 1 });
    s = mttSimToEnd(s, createRng(9));
    const m = s.mtt!;
    expect(m.finished).toBe(true);
    expect(m.totalEntries).toBeGreaterThan(200);
    expect(chipTotal(m)).toBe(m.totalEntries * 5000 * 1);
  }, 120000);
});
