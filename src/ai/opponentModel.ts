import { HandRecord } from '../engine/types';

/** 공개 행동으로부터만 집계하는 상대 통계 (분자/분모 분리 보관) */
export interface Stats {
  hands: number;
  vpip: number; pfr: number;
  tb: number; tbOpp: number;
  f3b: number; f3bOpp: number;
  cb: number; cbOpp: number;
  fcb: number; fcbOpp: number;
  aggr: number; passive: number;   // 포스트플랍 벳/레이즈 vs 콜
  sawFlop: number; wtsd: number;
}
export type OppModel = Record<string, Stats>;
export const emptyStats = (): Stats => ({ hands: 0, vpip: 0, pfr: 0, tb: 0, tbOpp: 0, f3b: 0, f3bOpp: 0, cb: 0, cbOpp: 0, fcb: 0, fcbOpp: 0, aggr: 0, passive: 0, sawFlop: 0, wtsd: 0 });

/** 베이지안 스무딩: (x + prior·k)/(n + k). 표본이 적으면 prior 로 수렴. */
export const smooth = (x: number, n: number, prior: number, k = 12) => (x + prior * k) / (n + k);

export function updateModel(model: OppModel, rec: HandRecord): void {
  const ids = rec.startStacks.map((s) => s.id);
  const get = (seat: number) => (model[ids[seat]] ??= emptyStats());
  const active = rec.startStacks.filter((s) => s.stack > 0).map((s) => s.seat);
  for (const seat of active) get(seat).hands++;

  let raises = 0, firstRaiser = -1, lastRaiser = -1;
  const acted = new Set<number>();
  const sawFlop = new Set<number>(active);
  const folded = new Set<number>();
  let flopBetOpen = true, cbettor = -1, cbetFaced = new Set<number>();
  for (const e of rec.events) {
    if (e.type === 'sb' || e.type === 'bb' || e.type === 'ante') continue;
    const st = get(e.seat);
    if (e.street === 'preflop') {
      const first = !acted.has(e.seat);
      if (first) {
        if (e.type === 'call' || e.type === 'raise' || e.type === 'bet') st.vpip++;
        if (e.type === 'raise' || e.type === 'bet') st.pfr++;
        acted.add(e.seat);
      }
      if (raises === 1) { st.tbOpp++; if (e.type === 'raise') st.tb++; }
      if (raises >= 2 && e.seat === firstRaiser) { st.f3bOpp++; if (e.type === 'fold') st.f3b++; }
      if (e.type === 'raise' || e.type === 'bet') { raises++; if (firstRaiser < 0) firstRaiser = e.seat; lastRaiser = e.seat; }
      if (e.type === 'fold') { folded.add(e.seat); sawFlop.delete(e.seat); }
    } else {
      if (e.type === 'bet' || e.type === 'raise') st.aggr++; else if (e.type === 'call') st.passive++;
      if (e.street === 'flop') {
        if (flopBetOpen) {
          if (e.seat === lastRaiser && raises > 0) { st.cbOpp++; if (e.type === 'bet') { st.cb++; cbettor = e.seat; flopBetOpen = false; } }
          if (e.type === 'bet' && e.seat !== lastRaiser) flopBetOpen = false;
        } else if (cbettor >= 0 && e.seat !== cbettor && !cbetFaced.has(e.seat)) {
          cbetFaced.add(e.seat); st.fcbOpp++; if (e.type === 'fold') st.fcb++;
        }
      }
    }
  }
  // 플랍을 본 플레이어 = 프리플랍에서 폴드하지 않은 플레이어 (sawFlop 은 프리플랍 폴드만 제거)
  const post = rec.board.length >= 3;
  if (post) for (const seat of sawFlop) get(seat).sawFlop++;
  if (rec.result && !rec.result.endedByFold) for (const k of Object.keys(rec.result.shown)) { const st = get(Number(k)); if (post) st.wtsd++; }
}

export const estimate = {
  vpip: (s: Stats | undefined) => smooth(s?.vpip ?? 0, s?.hands ?? 0, 0.3),
  pfr: (s: Stats | undefined) => smooth(s?.pfr ?? 0, s?.hands ?? 0, 0.15),
  foldToCbet: (s: Stats | undefined) => smooth(s?.fcb ?? 0, s?.fcbOpp ?? 0, 0.45, 8),
  aggFreq: (s: Stats | undefined) => smooth(s?.aggr ?? 0, (s?.aggr ?? 0) + (s?.passive ?? 0), 0.4, 15),
};
