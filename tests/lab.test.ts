import { describe, expect, it } from 'vitest';
import { analyzeBoard, bubbleFactor, combosOf, gridKeys, icmLab, makeSpotQuestion, preflopGrid, realSpotsFrom, verdictOfTraining, TRAINING_RULES } from '../src/analysis/lab';
import { parseCards, cardToString } from '../src/engine/cards';
import { createRng } from '../src/engine/rng';
import { simulateAll, defaultAIs } from '../src/game/session';
import { icm } from '../src/game/icm';

describe('프리플랍 연구소 (휴리스틱)', () => {
  const base = { scenario: 'rfi' as const, seats: 9, stackBB: 100, ante: false };
  const raiseSet = (pos: string, o: Partial<Parameters<typeof preflopGrid>[0]> = {}) => new Set(preflopGrid({ ...base, pos, ...o }).cells.flat().filter((c) => c.action !== 'fold').map((c) => c.key));
  it('격자는 169 클래스, 콤보 합 1326', () => {
    const keys = gridKeys().flat(); expect(keys.length).toBe(169); expect(new Set(keys).size).toBe(169);
    expect(keys.reduce((s, k) => s + combosOf(k), 0)).toBe(1326);
  });
  it('AA 는 항상 참여, 72o 는 폴드, 이른 포지션 ⊂ 늦은 포지션', () => {
    const utg = raiseSet('UTG'), btn = raiseSet('BTN');
    expect(utg.has('AA')).toBe(true); expect(utg.has('72o')).toBe(false);
    for (const k of utg) expect(btn.has(k)).toBe(true);
    expect(btn.size).toBeGreaterThan(utg.size);
  });
  it('푸시 범위는 스택이 짧을수록 넓다, 결과는 휴리스틱으로 표기', () => {
    const w = (bb: number) => preflopGrid({ ...base, scenario: 'pushfold', pos: 'BTN', stackBB: bb }).summary.total;
    expect(w(10)).toBeGreaterThan(w(15)); expect(w(15)).toBeGreaterThan(w(20) - 1e-9);
    expect(preflopGrid({ ...base, pos: 'CO' }).rigor).toBe('heuristic');
  });
  it('BB 방어: 늦은 포지션 오픈일수록 넓게 방어', () => {
    const t = (pos: string) => preflopGrid({ ...base, scenario: 'bbDefend', pos }).summary.total;
    expect(t('BTN')).toBeGreaterThan(t('UTG'));
  });
});

describe('포스트플랍 연구소', () => {
  it('K72 레인보우는 드라이, 모노톤 연결 보드는 웻', () => {
    const dry = analyzeBoard(parseCards('Ks 7d 2c'), 5), wet = analyzeBoard(parseCards('9h Th Jh'), 5);
    expect(dry.label).toBe('드라이'); expect(wet.label).toBe('웻'); expect(wet.suits).toBe('monotone');
    expect(wet.cbet.sizeFrac).toBeGreaterThan(dry.cbet.sizeFrac);
    expect(dry.rangeAdvantage).toBe('raiser');
  });
});

describe('ICM 연구소', () => {
  it('정확 ICM: 합 = 상금 풀, 칩이 많을수록 가치↑, 동일 스택은 균등', () => {
    const r = icmLab([5000, 3000, 2000], [50, 30, 20]);
    expect(r.mode).toBe('exact'); expect(r.equity.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect(r.equity[0]).toBeGreaterThan(r.equity[1]); expect(r.equity[1]).toBeGreaterThan(r.equity[2]);
    const eq = icmLab([1000, 1000, 1000], [50, 30, 20]).equity; expect(eq[0]).toBeCloseTo(eq[2], 9);
  });
  it('10명 이상은 몬테카를로로 표시되고 정확 ICM(9명)과 같은 모델에서 일치(오차 내)', () => {
    const stacks = [900, 800, 700, 600, 500, 400, 300, 200, 100];
    const ex = icmLab(stacks, [40, 25, 15, 10, 6, 4]);
    expect(ex.mode).toBe('exact');
    // 같은 모델을 몬테카를로로 강제 비교: 10번째 칩 0.0001 추가한 10인 필드는 9인과 거의 같다
    const mc = icmLab([...stacks, 0.0001], [40, 25, 15, 10, 6, 4], 3, 60000);
    expect(mc.mode).toBe('sampled'); expect(mc.se![0]).toBeGreaterThan(0);
    for (let i = 0; i < 9; i++) expect(Math.abs(mc.equity[i] - ex.equity[i])).toBeLessThan(4 * (mc.se![i] + 1e-9) + 0.05);
    expect(icm(stacks, [40, 25, 15, 10, 6, 4]).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
  });
  it('버블 팩터: 버블에서는 손익분기 승률이 칩EV(50%)보다 높다', () => {
    const b = bubbleFactor([3000, 3000, 2000, 1000], [60, 40], 0, 1);
    expect(b.breakevenEquity).toBeGreaterThan(0.5); expect(b.riskPremium).toBeGreaterThan(0); expect(b.bubbleFactor).toBeGreaterThan(1);
  });
});

describe('맞춤 훈련', () => {
  it('문제 생성은 시드로 재현되고 훈련 규칙(문항 수·기준)이 고정되어 있다', () => {
    const a = makeSpotQuestion(createRng(5), 'river-call', 1), b = makeSpotQuestion(createRng(5), 'river-call', 1);
    expect(a).toEqual(b); expect(a.board.length).toBe(5);
    expect(TRAINING_RULES.questionsPerSet).toBe(15);
  });
  it('실제 핸드에서 뽑은 문제는 결정 시점 정보만 담는다 (미래 카드·내 행동·결과 없음)', () => {
    const s = simulateAll({ mode: 'cash', seats: 4, startBB: 100, bb: 100, speed: 'normal', humanName: 'TETO', seed: 21, ais: defaultAIs(3, 3) }, 60, { profileId: 'Balanced', difficulty: 3 });
    const recs = s.records.map((r) => ({ ...r, startStacks: r.startStacks.map((x, i) => (i === 0 ? { ...x, id: 'hero' } : x)) }));
    const qs = realSpotsFrom(recs as never, 'hero', 40);
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      expect(q.source).toBe('real-spot');
      const [, , h, no] = q.id.split(':'); const rec = recs.find((r) => String(r.handNo) === h)!;
      void no;
      expect(rec.board.slice(0, q.board.length).map(cardToString)).toEqual(q.board.map(cardToString)); // 보드는 당시까지의 카드만
      const keys = Object.keys(q); expect(keys).not.toContain('action'); expect(keys).not.toContain('net');
      expect(q.toCall).toBeGreaterThan(0);
    }
  });
  it('훈련 판정: 표본 부족/기준 미달/달성을 구분한다', () => {
    const at = { id: '1', leak: 'x', at: 0, reviewDue: 0, handsAtTraining: 0 };
    expect(verdictOfTraining({ ...at, pre: 0.4, post: 0.7, n: 15 })).toContain('달성');
    expect(verdictOfTraining({ ...at, pre: 0.4, post: 0.7, n: 6 })).toContain('표본 부족');
    expect(verdictOfTraining({ ...at, pre: 0.5, post: 0.55, n: 15 })).toContain('기준 미달');
    expect(verdictOfTraining({ ...at, pre: null, post: null, n: 0 })).toBe('진행 중');
  });
});
