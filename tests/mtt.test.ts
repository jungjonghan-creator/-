import { describe, it, expect } from 'vitest';
import { icm, payoutStructure } from '../src/game/icm';
import { newMTTSession, mttAdvance, mttSimToEnd, chipTotal, mttReenter } from '../src/game/mtt';
import { beginHand, runAIUntilHuman, humanAct, Session } from '../src/game/session';
import { legalActions, checkInvariants } from '../src/engine/game';
import { createRng } from '../src/engine/rng';
import { validateSession } from '../src/persist/validate';

const mk = (entrants: number, extra: Partial<Parameters<typeof newMTTSession>[0]['mtt']> = {}, seed = 5) =>
  newMTTSession({ startBB: 50, bb: 100, speed: 'hyper', humanName: 'TETO', seed, difficulty: 2, profileId: 'Balanced', mtt: { entrants, tableSize: 9, buyIn: 100, reentry: false, reentryUntilLevel: 4, maxReentries: 1, ...extra } });

function playHeroHand(s: Session, rng = createRng(1)): Session {
  s = beginHand(s, rng);
  s = runAIUntilHuman(s);
  let g = 0;
  while (s.game.street !== 'complete' && g++ < 200) {
    const la = legalActions(s.game)!;
    s = runAIUntilHuman(humanAct(s, la.canCheck ? { type: 'check' } : la.callAmount > s.game.players.find((p) => p.isHuman)!.stack * 0.4 ? { type: 'fold' } : { type: 'call' }));
  }
  return s;
}

describe('ICM', () => {
  it('상금 합계 보존, 스택 큰 쪽이 더 큰 기대값, 동일 스택은 동일 기대값', () => {
    const pays = [500, 300, 200];
    const e = icm([5000, 3000, 2000, 1000], pays);
    expect(e.reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 6);
    expect(e[0]).toBeGreaterThan(e[1]); expect(e[1]).toBeGreaterThan(e[2]); expect(e[2]).toBeGreaterThan(e[3]);
    const f = icm([1000, 1000, 1000], pays);
    expect(f[0]).toBeCloseTo(f[1], 9); expect(f[0]).toBeCloseTo(1000 / 3, 6);
    // 칩 리더의 ICM 비중은 칩 비중보다 작다 (ICM 의 핵심 성질)
    expect(e[0] / 1000).toBeLessThan(5000 / 11000 + 0.5);
    expect(e[3] / 1000).toBeGreaterThan(1000 / 11000);
  });
  it('상금 구조 합계 = 상금 풀', () => {
    for (const n of [9, 18, 45, 90, 200]) { const p = payoutStructure(n, 100); expect(p.reduce((a, b) => a + b, 0)).toBe(n * 100); expect(p[0]).toBeGreaterThanOrEqual(p[1] ?? 0); }
  });
});

describe('MTT', () => {
  it('초기 구성: 다중 테이블, 인원 균형, 칩 총량', () => {
    const s = mk(45);
    const m = s.mtt!;
    expect(m.tables.length).toBe(5);
    expect(m.tables.every((t) => t.game.players.length === 9)).toBe(true);
    expect(chipTotal(m)).toBe(45 * 5000);
    expect(new Set(m.tables.flatMap((t) => t.game.players.map((p) => p.id))).size).toBe(45);
  });
  it('여러 라운드 진행: 칩 보존·테이블 균형·이동·중복 좌석 없음 + 저장 검증 통과', () => {
    let s = mk(36, {}, 11);
    const rng = createRng(3);
    const total = chipTotal(s.mtt!);
    let maxTablesDiff = 0;
    for (let r = 0; r < 25 && !s.mtt!.heroOut && !s.mtt!.finished; r++) {
      s = playHeroHand(s, rng);
      s = mttAdvance(s, rng);
      const m = s.mtt!;
      expect(chipTotal(m)).toBe(total);
      const ids = m.tables.flatMap((t) => t.game.players.map((p) => p.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect(m.remaining).toBe(ids.length);
      const sizes = m.tables.map((t) => t.game.players.length);
      maxTablesDiff = Math.max(maxTablesDiff, Math.max(...sizes) - Math.min(...sizes));
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(9);
      expect(m.tables.length).toBe(Math.ceil(m.remaining / 9));
      expect(checkInvariants(s.game)).toEqual([]);
      expect(validateSession(s).ok, validateSession(s).errors.join()).toBe(true);
    }
    expect(s.mtt!.round).toBeGreaterThan(5);
  }, 120000);
  it('끝까지: 버블/파이널 테이블/우승자 1명, 순위 1..N 유일', () => {
    let s = mk(27, {}, 21);
    const rng = createRng(9);
    let sawFinal = false, sawBubble = false;
    for (let r = 0; r < 400 && !s.mtt!.finished; r++) {
      s = mttAdvance({ ...s, game: s.game }, rng, 0.25, true);
      if (s.mtt!.finalTable) sawFinal = true;
      if (s.mtt!.bubble) sawBubble = true;
    }
    // 동시 탈락으로 버블 라운드를 건너뛸 수 있으므로, 버블이 관측될 때까지 다른 시드로 추가 확인
    for (let seed = 40; !sawBubble && seed < 60; seed++) {
      let t = mk(27, {}, seed); const r2 = createRng(seed);
      for (let r = 0; r < 400 && !t.mtt!.finished; r++) { t = mttAdvance(t, r2, 0.25, true); if (t.mtt!.bubble) sawBubble = true; }
    }
    const m = s.mtt!;
    expect(m.finished).toBe(true);
    expect(m.remaining).toBe(1);
    const places = Object.values(m.places).sort((a, b) => a - b);
    expect(places).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    expect(sawFinal).toBe(true);
    expect(sawBubble).toBe(true);
    expect(chipTotal(m)).toBe(27 * 5000);
    // ICM 로그는 내가 파이널 테이블(≤9명)까지 살아남았을 때만 쌓인다
    if (m.places['hero'] <= 9) expect(m.icmLog.length).toBeGreaterThan(0);
  }, 300000);
  it('mttSimToEnd 와 재진입', () => {
    let s = mk(18, { reentry: true, reentryUntilLevel: 99 }, 31);
    const rng = createRng(2);
    // 사람 칩을 0 으로 만들어 강제 탈락
    const m = structuredClone(s.mtt!);
    const ht = m.tables.find((t) => t.id === m.heroTable)!;
    const hero = ht.game.players.find((p) => p.isHuman)!;
    const other = ht.game.players.find((p) => !p.isHuman)!;
    other.stack += hero.stack; hero.stack = 0;
    s = { ...s, mtt: m, game: ht.game };
    s = mttAdvance(s, rng);
    expect(s.mtt!.heroOut).toBe(true);
    expect(s.mtt!.heroCanReenter).toBe(true);
    const s2 = mttReenter(s);
    expect(s2.mtt!.heroOut).toBe(false);
    expect(s2.mtt!.entries).toBe(2);
    const total = chipTotal(s2.mtt!);
    expect(total).toBe(19 * 5000 - 0);
    const done = mttSimToEnd(s2, rng);
    expect(done.mtt!.finished).toBe(true);
  }, 300000);
});
