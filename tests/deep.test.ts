import { describe, expect, it } from 'vitest';
import { simulateAll, defaultAIs } from '../src/game/session';
import { replayRecord } from '../src/engine/replay';
import { observe } from '../src/ai/observation';
import { createRng } from '../src/engine/rng';
import { buildRanges, evaluateDecision, COMBOS, summarizeRange } from '../src/analysis/deep';
import { reviewHand } from '../src/analysis/review';

const mkSession = (seed: number, seats = 6) => simulateAll({ mode: 'cash', seats, startBB: 100, bb: 100, speed: 'normal', humanName: 'obs', ais: defaultAIs(seats - 1, 3 as never, 'Balanced'), seed, cash: { tableId: 't', label: 't', min: 1, max: 1 } } as never, 80, { profileId: 'Balanced', difficulty: 3 } as never);

describe('심층 레인지 추론', () => {
  const s = mkSession(31);
  const points: { obs: ReturnType<typeof observe>; rec: (typeof s.records)[number]; idx: number }[] = [];
  for (const rec of [...s.records, ...mkSession(32).records, ...mkSession(33, 9).records]) rec.actions.forEach((a, idx) => { if (a.seat === 0) { const b = replayRecord(rec, idx); if (b.street !== 'complete') points.push({ obs: observe(b, 0), rec, idx }); } });

  it('영웅 홀카드·보드와 겹치는 콤보는 가중치 0', () => {
    for (const { obs } of points.slice(0, 120)) {
      const dead = new Set([...obs.hole, ...obs.board]);
      for (const r of buildRanges(obs)) for (let i = 0; i < COMBOS.length; i++) if (dead.has(COMBOS[i].a) || dead.has(COMBOS[i].b)) expect(r.w[i]).toBe(0);
    }
  });
  it('같은 입력·같은 시드면 결과가 같다 (결정론)', () => {
    const p = points.find((x) => x.obs.board.length >= 3 && x.obs.legal.canRaise)!;
    const run = () => evaluateDecision(p.obs, { type: 'call' }, createRng(5), { sims: 300 });
    const a = run(), b = run();
    expect(a.equity).toBe(b.equity); expect(a.options.map((o) => o.ev)).toEqual(b.options.map((o) => o.ev));
  });
  it('포스트플랍에서 벳/레이즈한 상대는 레인지를 좁힌다', () => {
    let bet = 0, nb = 0, other = 0, no = 0;
    for (const { obs } of points) {
      if (obs.board.length < 3) continue;
      const rs = buildRanges(obs);
      for (const r of rs) {
        const betLine = r.line.some((l) => /^(플랍|턴|리버) (벳|레이즈)/.test(l));
        const e = summarizeRange(r.w).ess;
        if (betLine) { bet += e; nb++; } else { other += e; no++; }
      }
    }
    expect(nb).toBeGreaterThan(5);
    expect(bet / nb).toBeLessThan(other / no);
  });
  it('EV 일관성: 폴드 0, 최선 ≥ 모든 옵션, 손실 ≥ 0, 오차 양수', () => {
    for (const p of points.filter((x) => x.obs.board.length >= 3).slice(0, 40)) {
      const d = evaluateDecision(p.obs, { type: p.rec.events.length ? 'call' : 'call' }, createRng(9), { sims: 200 });
      for (const o of d.options) { expect(d.best.ev).toBeGreaterThanOrEqual(o.ev - 1e-9); expect(o.se).toBeGreaterThanOrEqual(0); if (o.id === 'fold') expect(o.ev).toBe(0); }
      expect(d.loss).toBeGreaterThanOrEqual(0);
    }
  });
  it('리뷰: 결정 카드에 심층 결과와 선택지별 EV가 붙는다', () => {
    let seen = 0;
    for (const rec of s.records.slice(0, 40)) {
      const rv = reviewHand(rec, rec.startStacks[0].id, 300);
      for (const d of rv.decisions) if (d.deep) { seen++; expect(d.deep.options.length).toBeGreaterThan(0); expect(d.deep.options.filter((o) => o.best).length).toBe(1); }
    }
    expect(seen).toBeGreaterThan(10);
  });
});
