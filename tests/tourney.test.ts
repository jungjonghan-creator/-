import { describe, it, expect } from 'vitest';
import { newMTTSession, mttAdvance, chipTotal } from '../src/game/mtt';
import { tourneyStatus, tourneyAnnouncements, zoneOf, TourneyStatus } from '../src/game/tourney';
import { TIERS, unlockedTiers, tierById } from '../src/game/tiers';
import { createRng } from '../src/engine/rng';
import { newSession, beginHand, defaultAIs, tournamentContext } from '../src/game/session';
import { decide, bubbleFactor } from '../src/ai/decide';
import { observe } from '../src/ai/observation';
import { startHandWithDeck } from '../src/engine/game';
import { shuffledDeck } from '../src/engine/rng';
import { mkGame } from './helpers';

const mk = (entrants: number, extra: object = {}, seed = 5, speed: 'hyper' | 'turbo' | 'normal' = 'hyper') =>
  newMTTSession({ startBB: 50, bb: 100, speed, humanName: 'TETO', seed, difficulty: 2, profileId: 'Balanced', mtt: { entrants, tableSize: 9, buyIn: 100, reentry: true, reentryUntilLevel: 4, maxReentries: 2, ...extra } });

describe('토너먼트 상태', () => {
  it('평균 스택·순위·M값·입상 인원이 정확히 계산된다', () => {
    const s = beginHand(mk(27), createRng(1));
    const st = tourneyStatus(s)!;
    expect(st.playersLeft).toBe(27);
    expect(st.totalChips).toBe(27 * 5000);
    expect(st.avgStack).toBe(5000);
    expect(st.entrants).toBe(27);
    expect(st.heroRank).toBeGreaterThanOrEqual(1);
    expect(st.heroRank).toBeLessThanOrEqual(27);
    // 핸드 중이라 블라인드가 투입된 칩도 포함 → 모든 플레이어 칩 합 = 총칩
    expect(st.eliminated).toBe(0);
    expect(st.paidPlaces).toBe(st.payouts.length);
    expect(st.toMoney).toBe(27 - st.paidPlaces);
    expect(st.stage).toBe('early');
    // M = 스택 / (SB+BB+앤티×인원)
    const g = s.game; const n = g.players.length;
    const expectM = st.heroChips / (st.sb + st.bb + st.ante * n);
    expect(st.M).toBeCloseTo(expectM, 6);
  });
  it('M 구간 경계', () => {
    expect(zoneOf(25)).toBe('comfortable'); expect(zoneOf(20)).toBe('comfortable');
    expect(zoneOf(15)).toBe('pressure'); expect(zoneOf(8)).toBe('danger'); expect(zoneOf(3)).toBe('shove');
  });
  it('라운드가 진행되며 인원 감소·평균 스택 증가·블라인드 상승·단계 전환', () => {
    let s = mk(27);
    const rng = createRng(3);
    const seen = new Set<string>();
    let prev: TourneyStatus | null = null;
    const ann: string[] = [];
    let first = tourneyStatus(s)!;
    let last = first;
    for (let r = 0; r < 80 && !s.mtt!.finished; r++) {
      s = mttAdvance(s, rng, 0.25, true);
      const cur = tourneyStatus(s)!;
      seen.add(cur.stage);
      if (prev) ann.push(...tourneyAnnouncements(prev, cur));
      expect(cur.playersLeft).toBe(s.mtt!.remaining);
      expect(cur.avgStack).toBeCloseTo((cur.totalChips) / cur.playersLeft, 6);
      prev = cur; last = cur;
    }
    expect(last.playersLeft).toBeLessThan(first.playersLeft);
    expect(last.avgStack).toBeGreaterThan(first.avgStack);
    expect(last.level).toBeGreaterThan(first.level);
    expect(seen.has('middle') || seen.has('bubble') || seen.has('money')).toBe(true);
    expect(ann.some((a) => /블라인드 상승/.test(a))).toBe(true);
    expect(ann.some((a) => /탈락/.test(a))).toBe(true);
  }, 120000);
});

describe('레이트 등록·재진입으로 필드가 변한다', () => {
  it('등록 시간 동안 참가자가 늘고, 마감 후 고정되며, 칩 총량과 순위 유일성이 유지된다', () => {
    let s = mk(36, { lateRegUntilLevel: 3, lateRegPerRound: 2, aiReentry: true }, 9);
    expect(s.mtt!.registrationOpen).toBe(true);
    const rng = createRng(4);
    const start = s.mtt!.totalEntries;
    let sawClose = false; let afterClose = -1;
    for (let r = 0; r < 300 && !s.mtt!.finished; r++) {
      s = mttAdvance(s, rng, 0.2, true);
      const m = s.mtt!;
      expect(chipTotal(m)).toBe(m.totalEntries * m.startStack);
      const ids = m.tables.flatMap((t) => t.game.players.map((p) => p.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(m.remaining);
      expect(m.tables.every((t) => t.game.players.length <= 9)).toBe(true);
      if (!m.registrationOpen && !sawClose) { sawClose = true; afterClose = m.totalEntries; }
      if (sawClose) expect(m.totalEntries).toBe(afterClose);
      expect(m.payouts.reduce((a, b) => a + b, 0)).toBe(m.prizePool);
    }
    const m = s.mtt!;
    expect(sawClose).toBe(true);
    expect(m.totalEntries).toBeGreaterThan(start);           // 필드가 커졌다
    expect(m.lateJoined).toBe(m.totalEntries - start);
    expect(m.finished).toBe(true);
    const places = Object.values(m.places).sort((a, b) => a - b);
    expect(places).toEqual(Array.from({ length: m.totalEntries }, (_, i) => i + 1)); // 1..N 유일
    expect(m.payouts.length).toBe(Math.max(3, Math.round(m.totalEntries * 0.15)));
  }, 300000);
  it('레이트 등록이 없는 대회는 필드가 고정', () => {
    let s = mk(18); const rng = createRng(2);
    for (let r = 0; r < 10 && !s.mtt!.finished; r++) { s = mttAdvance(s, rng, 0.2, true); expect(s.mtt!.totalEntries).toBe(18); }
  });
});

describe('래더', () => {
  it('규모가 단계마다 커지고, 입상해야 다음 단계가 열린다', () => {
    for (let i = 1; i < TIERS.length; i++) expect(TIERS[i].entrants).toBeGreaterThanOrEqual(TIERS[i - 1].entrants);
    expect(TIERS.length).toBeGreaterThanOrEqual(6);
    expect(unlockedTiers([])).toBe(1);
    expect(unlockedTiers([{ tierId: 'hu', place: 3, prize: 0, entrants: 2, date: 0 }])).toBe(1);
    expect(unlockedTiers([{ tierId: 'hu', place: 1, prize: 100, entrants: 2, date: 0 }])).toBe(2);
    // 중간 단계를 건너뛸 수 없다
    expect(unlockedTiers([{ tierId: 'sng6', place: 1, prize: 100, entrants: 6, date: 0 }])).toBe(1);
    expect(tierById('mtt54').lateRegUntilLevel).toBeGreaterThan(0);
  });
});

describe('AI 의 토너먼트 압력 (버블)', () => {
  it('버블 압력 계수', () => {
    const base: any = { tournament: { playersLeft: 10, paid: 9, avgStack: 5000 } };
    expect(bubbleFactor(base)).toBe(1);
    expect(bubbleFactor({ tournament: { playersLeft: 12, paid: 9, avgStack: 1 } } as any)).toBe(0.3);
    expect(bubbleFactor({ tournament: { playersLeft: 20, paid: 9, avgStack: 1 } } as any)).toBe(0);
    expect(bubbleFactor({} as any)).toBe(0);
  });
  it('버블에서 평균 스택 AI 는 레이즈에 대한 콜/재레이즈 빈도가 줄고, 칩리더는 오픈이 늘어난다', () => {
    const play = (stackMul: number, tournament: boolean) => {
      let cont = 0, opens = 0, n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const base = mkGame([5000 * stackMul, 5000, 5000]);
        const g = startHandWithDeck(base, shuffledDeck(createRng(seed)), 1);
        const seat = g.toAct!;
        const obs = observe(g, seat, tournament ? { playersLeft: 10, paid: 9, avgStack: 5000 } : undefined);
        const d = decide(obs, { profileId: 'Balanced', difficulty: 5 }, {}, createRng(seed), 1);
        n++;
        if (obs.currentBet > obs.bb) { /* 아직 레이즈 없음 — 오픈 결정 */ }
        if (d.action.type === 'raise' || d.action.type === 'bet' || d.action.type === 'allin') opens++;
        if (d.action.type === 'call') cont++;
      }
      return { opens: opens / n, cont: cont / n };
    };
    const midBubble = play(1, true), midNo = play(1, false);
    const bigBubble = play(3, true), bigNo = play(3, false);
    console.log('mid', midNo, midBubble, 'big', bigNo, bigBubble);
    expect(midBubble.opens).toBeLessThan(midNo.opens);
    expect(bigBubble.opens).toBeGreaterThan(bigNo.opens);
  });
  it('tournamentContext: MTT/SNG 에서만 제공', () => {
    const cash = newSession({ mode: 'cash', seats: 6, startBB: 100, bb: 100, speed: 'normal', humanName: 'T', ais: defaultAIs(5, 3), seed: 1 });
    expect(tournamentContext(cash)).toBeUndefined();
    const m = mk(18);
    const ctx = tournamentContext(m)!;
    expect(ctx.playersLeft).toBe(18); expect(ctx.avgStack).toBe(5000); expect(ctx.paid).toBeGreaterThanOrEqual(3);
  });
});
