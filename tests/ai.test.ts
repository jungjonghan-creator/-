import { describe, it, expect } from 'vitest';
import { decide } from '../src/ai/decide';
import { observe } from '../src/ai/observation';
import { PROFILE_IDS, AISetup, Difficulty } from '../src/ai/profiles';
import { emptyStats, updateModel } from '../src/ai/opponentModel';
import { applyAction, checkInvariants, validateAction, startHandWithDeck } from '../src/engine/game';
import { createRng, shuffledDeck } from '../src/engine/rng';
import { aiStep, beginHand, newSession, simulateAll, SessionConfig, defaultAIs, Session } from '../src/game/session';
import { Stats } from '../src/ai/opponentModel';

const cfg = (seats: number, ais: AISetup[], seed = 1, startBB = 100): SessionConfig =>
  ({ mode: 'cash', seats, startBB, bb: 100, speed: 'normal', humanName: 'TETO', ais, seed });

function playerStats(s: Session, id: string): Stats {
  const m = {} as Record<string, Stats>;
  for (const r of s.records) updateModel(m, r);
  return m[id] ?? emptyStats();
}

describe('AI 합법성', () => {
  it('모든 프로필×난이도가 항상 합법 행동만 선택한다', () => {
    for (const pid of PROFILE_IDS) for (const d of [1, 3, 5] as Difficulty[]) {
      let s = newSession(cfg(6, Array(5).fill({ profileId: pid, difficulty: d }), 7, 40));
      s.game.players[0].isHuman = false; s = { ...s, aiBySeat: { ...s.aiBySeat, 0: { profileId: pid, difficulty: d } } };
      const rng = createRng(3);
      for (let h = 0; h < 6; h++) {
        s = beginHand(s, rng); if (s.game.gameOver) break;
        let guard = 0;
        while (s.game.toAct !== null && guard++ < 500) {
          const g = s.game, seat = g.toAct!;
          const obs = observe(g, seat);
          const dec = decide(obs, s.aiBySeat[seat], s.memory, createRng(guard), 1);
          expect(() => validateAction(g, dec.action), `${pid} d${d}`).not.toThrow();
          s = aiStep(s).sess;
          expect(checkInvariants(s.game)).toEqual([]);
        }
      }
    }
  });
});

describe('AI 정보 차단', () => {
  it('Observation 에는 상대 홀카드·덱·미래 카드 필드가 없다', () => {
    let s = newSession(cfg(6, defaultAIs(5), 5));
    s = beginHand(s, createRng(5));
    const obs = observe(s.game, 1);
    const json = JSON.stringify(obs);
    expect(Object.keys(obs)).not.toContain('deck');
    expect(json).not.toMatch(/"deck"|"burned"|"deckPos"/);
    expect(obs.players.every((p) => !('hole' in p))).toBe(true);
    expect(obs.hole).toEqual(s.game.players[1].hole);
  });
  it('상대 홀카드·남은 덱이 달라도(관찰 동일) AI 결정은 동일하다', () => {
    // 같은 AI 홀카드·보드, 다른 상대 홀카드/덱 순서
    const base = newSession(cfg(3, defaultAIs(2, 5), 9, 100));
    let diffs = 0, trials = 0;
    for (let t = 0; t < 40; t++) {
      const d1 = shuffledDeck(createRng(100 + t));
      // d2: 좌석 1(AI)의 홀카드와 보드 위치는 유지, 나머지(상대 홀카드·미래카드)만 재배치
      const d2 = [...d1];
      const n = 3;
      const keep = new Set<number>();
      // 배분 순서에서 hero(AI seat)의 인덱스: SB부터 -> 계산을 위해 실제 게임 사용
      const g1 = startHandWithDeck(base.game, d1, 1);
      const seat = g1.toAct!;
      const heroIdx = [seat];
      void heroIdx; void n; void keep;
      const heroCards = g1.players[seat].hole;
      // 보드와 홀카드(프리플랍은 보드 없음)는 그대로, 나머지 카드만 섞음
      const fixedIdx = d1.map((c, i) => (heroCards.includes(c) ? i : -1)).filter((i) => i >= 0);
      const freeIdx = d1.map((_, i) => i).filter((i) => !fixedIdx.includes(i));
      const free = freeIdx.map((i) => d1[i]);
      const r = createRng(777 + t);
      for (let i = free.length - 1; i > 0; i--) { const j = r.int(i + 1); [free[i], free[j]] = [free[j], free[i]]; }
      freeIdx.forEach((idx, k) => { d2[idx] = free[k]; });
      const g2 = startHandWithDeck(base.game, d2, 1);
      const o1 = observe(g1, g1.toAct!), o2 = observe(g2, g2.toAct!);
      expect(o1).toEqual(o2); // 관찰 DTO 자체가 동일
      const a1 = decide(o1, base.aiBySeat[1], {}, createRng(42), 1);
      const a2 = decide(o2, base.aiBySeat[1], {}, createRng(42), 1);
      trials++; if (JSON.stringify(a1) !== JSON.stringify(a2)) diffs++;
    }
    expect(diffs).toBe(0);
    expect(trials).toBe(40);
  });
  it('플랍 이후에도 상대 홀카드/미래 보드가 달라도 동일 결정', () => {
    const base = newSession(cfg(2, defaultAIs(1, 5), 9, 100));
    for (let t = 0; t < 20; t++) {
      const d1 = shuffledDeck(createRng(500 + t));
      let g1 = startHandWithDeck(base.game, d1, 1);
      // 프리플랍 콜/체크로 플랍까지
      while (g1.street === 'preflop') g1 = applyAction(g1, g1.toAct !== null && observe(g1, g1.toAct).legal.canCheck ? { type: 'check' } : { type: 'call' });
      const seat = g1.toAct!;
      const known = new Set([...g1.players[seat].hole, ...g1.board]);
      const d2 = [...d1];
      const free: number[] = [];
      d1.forEach((c, i) => { if (!known.has(c)) free.push(i); });
      // 진행 중 미공개 카드(상대 홀, 번, 미래 보드)만 순환 이동
      const vals = free.map((i) => d1[i]);
      const other = g1.players.find((_, i) => i !== seat)!.hole;
      // 상대 홀카드를 번/미래카드와 교환
      const idxOppA = d1.indexOf(other[0]);
      const idxFuture = g1.deckPos + 3;
      [d2[idxOppA], d2[idxFuture]] = [d2[idxFuture], d2[idxOppA]];
      void vals;
      let g2 = startHandWithDeck(base.game, d2, 1);
      while (g2.street === 'preflop') g2 = applyAction(g2, observe(g2, g2.toAct!).legal.canCheck ? { type: 'check' } : { type: 'call' });
      expect(g2.board).toEqual(g1.board);
      const o1 = observe(g1, g1.toAct!), o2 = observe(g2, g2.toAct!);
      expect(o1).toEqual(o2);
      expect(decide(o1, base.aiBySeat[1], {}, createRng(9), 1)).toEqual(decide(o2, base.aiBySeat[1], {}, createRng(9), 1));
    }
  });
  it('같은 조건에서 결정은 재현 가능하다', () => {
    let s = newSession(cfg(6, defaultAIs(5), 5)); s = beginHand(s, createRng(5));
    const obs = observe(s.game, s.game.toAct!);
    const a = decide(obs, s.aiBySeat[s.game.toAct!], {}, createRng(1), 1);
    const b = decide(obs, s.aiBySeat[s.game.toAct!], {}, createRng(1), 1);
    expect(a).toEqual(b);
  });
});

describe('AI 성향별 통계 차이 (6-max, 같은 난이도, 시뮬레이션)', () => {
  const hands = 600;
  const run = (pid: string) => {
    const others: AISetup[] = Array(5).fill({ profileId: 'Balanced', difficulty: 3 });
    const s = simulateAll(cfg(6, others, 11 + pid.length, 200), hands, { profileId: pid, difficulty: 3 });
    const st = playerStats(s, 'hero');
    return { vpip: st.vpip / st.hands, pfr: st.pfr / st.hands, aggr: st.aggr / Math.max(1, st.aggr + st.passive), hands: st.hands };
  };
  const res: Record<string, ReturnType<typeof run>> = {};
  it('8개 성향 시뮬레이션', () => {
    for (const p of PROFILE_IDS) res[p] = run(p);
    console.table(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { vpip: +v.vpip.toFixed(3), pfr: +v.pfr.toFixed(3), af: +v.aggr.toFixed(3), hands: v.hands }])));
    for (const p of PROFILE_IDS) expect(res[p].hands).toBeGreaterThan(300);
  }, 300000);
  it('VPIP 순서: Nit < TAG < Balanced < LAG < Maniac', () => {
    expect(res.Nit.vpip).toBeLessThan(res.TAG.vpip);
    expect(res.TAG.vpip).toBeLessThan(res.LAG.vpip);
    expect(res.LAG.vpip).toBeLessThan(res.Maniac.vpip);
    expect(res.Nit.vpip).toBeLessThan(res.Balanced.vpip);
  });
  it('PFR/공격성: Maniac·LAG > TAG > Nit, 콜링스테이션은 수동적', () => {
    expect(res.Maniac.pfr).toBeGreaterThan(res.TAG.pfr);
    expect(res.LAG.pfr).toBeGreaterThan(res.TAG.pfr);
    expect(res.TAG.pfr).toBeGreaterThan(res.Nit.pfr);
    expect(res.CallingStation.aggr).toBeLessThan(res.TAG.aggr);
    expect(res.CallingStation.vpip - res.CallingStation.pfr).toBeGreaterThan(res.TAG.vpip - res.TAG.pfr);
    expect(res.Maniac.aggr).toBeGreaterThan(res.Balanced.aggr);
  });
});
