/** 레인지 추론 백테스트: AI끼리 친 핸드에서 "관찰자(좌석 0)"가 본 공개 정보만으로 추정한 승률이,
 *  상대 실제 패에 대한 진짜 승률(몬테카를로)과 얼마나 가까운지 비교한다. 낮을수록 좋은 MSE. */
import { simulateAll, defaultAIs } from '../src/game/session';
import { replayRecord } from '../src/engine/replay';
import { observe } from '../src/ai/observation';
import { inferRange } from '../src/ai/decide';
import { estimateEquity } from '../src/ai/equity';
import { evaluate } from '../src/engine/evaluator';
import { createRng } from '../src/engine/rng';
import { buildRanges, drawSamples, COMBOS, TUNE } from '../src/analysis/deep';
import type { Card } from '../src/engine/cards';

const sessions = Number(process.argv[2] ?? 12), sims = 600;
if (process.argv[3]) TUNE.vOff = Number(process.argv[3]); if (process.argv[4]) TUNE.callOff = Number(process.argv[4]);
const seatsList = [3, 6, 9];
const acc: Record<string, { n: number; se: number; bias: number }> = {};
const add = (k: string, est: number, truth: number) => { const a = (acc[k] ??= { n: 0, se: 0, bias: 0 }); a.n++; a.se += (est - truth) ** 2; a.bias += est - truth; };
let ll = 0, llU = 0, nll = 0;
const t0 = Date.now();
for (let si = 0; si < sessions; si++) {
  const seats = seatsList[si % 3];
  const s = simulateAll({ mode: 'cash', seats, startBB: 100, bb: 100, speed: 'normal', humanName: 'obs', ais: defaultAIs(seats - 1, (3 + (si % 3)) as any, 'Balanced'), seed: 900 + si, cash: { tableId: 't', label: 't', min: 1, max: 1 } } as any, 160, { profileId: 'Balanced', difficulty: 3 } as any);
  const rng = createRng(77 + si);
  for (const rec of s.records) {
    const hs = rec.holes[0]; if (!hs || hs.length < 2) continue;
    rec.actions.forEach((a, idx) => {
      if (a.seat !== 0) return;
      const before = replayRecord(rec, idx);
      if (before.street === 'complete') return;
      const obs = observe(before, 0);
      const opp = obs.players.filter((p) => !p.isHero && p.inHand && !p.folded);
      if (!opp.length) return;
      const raised = obs.history.some((e) => e.street === 'preflop' && (e.type === 'raise' || e.type === 'bet'));
      if (obs.street === 'preflop' && !raised) return;
      const hole = obs.hole as [Card, Card];
      // 진실: 상대 실제 패 vs 나, 남은 보드 MC
      const holes = opp.map((o) => rec.holes[o.seat] as Card[]);
      const used = new Set<Card>([...hole, ...obs.board, ...holes.flat()]);
      const pool: Card[] = []; for (let c = 0; c < 52; c++) if (!used.has(c)) pool.push(c);
      const need = 5 - obs.board.length; let tw = 0; const T = 300;
      for (let t = 0; t < T; t++) {
        for (let i = 0; i < need; i++) { const j = i + rng.int(pool.length - i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        const full = [...obs.board, ...pool.slice(0, need)];
        const h = evaluate([...hole, ...full]); let best = h, ties = 1, lose = false;
        for (const o of holes) { const sc = evaluate([...o, ...full]); if (sc > h) { lose = true; break; } if (sc === h) ties++; }
        tw += lose ? 0 : 1 / ties;
      }
      const truth = tw / T;
      const tag = obs.street === 'preflop' ? 'pre' : obs.street;
      const oldR = opp.map((o) => inferRange(obs, o));
      const eo = estimateEquity(hole, obs.board, oldR, sims, rng);
      const rs = buildRanges(obs);
      const smp = drawSamples(hole, obs.board, rs, sims, rng);
      const en = smp.length ? smp.reduce((x, y) => x + y.win, 0) / smp.length : 0.5;
      for (const k of ['all', tag, opp.length > 1 ? 'multi' : 'hu']) { add('old ' + k, eo, truth); add('new ' + k, en, truth); }
      rs.forEach((r, k) => {
        const h = holes[k]; const ix = COMBOS.findIndex((c) => (c.a === h[0] && c.b === h[1]) || (c.a === h[1] && c.b === h[0]));
        let tot = 0; for (let i = 0; i < r.w.length; i++) { const c = COMBOS[i]; if (!used.has(c.a) || [...hole, ...obs.board].includes(c.a) || [...hole, ...obs.board].includes(c.b)) { /* dead */ } if (![...hole, ...obs.board].includes(c.a) && ![...hole, ...obs.board].includes(c.b)) tot += r.w[i]; }
        let live = 0; for (let i = 0; i < r.w.length; i++) if (![...hole, ...obs.board].includes(COMBOS[i].a) && ![...hole, ...obs.board].includes(COMBOS[i].b)) live++;
        if (tot > 0 && ix >= 0) { ll += Math.log(Math.max(1e-6, r.w[ix] / tot)); llU += Math.log(1 / live); nll++; }
      });
    });
  }
}
const keys = Object.keys(acc).sort();
console.log(`세션 ${sessions}, 소요 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
for (const k of keys) { const a = acc[k]; console.log(`${k.padEnd(12)} n=${String(a.n).padStart(5)}  RMSE=${Math.sqrt(a.se / a.n).toFixed(4)}  bias=${(a.bias / a.n).toFixed(4)}`); }
console.log(`상대 실제 패의 평균 로그우도: 신규 ${(ll / nll).toFixed(3)} vs 균등 ${(llU / nll).toFixed(3)} (n=${nll}) — 클수록 좋음`);
