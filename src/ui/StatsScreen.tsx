import { useMemo, useState } from 'react';
import { heroStats } from '../analysis/stats';
import { reviewHand, DecisionReview } from '../analysis/review';
import { RecordGroup, useGame } from '../store/useGame';

export function StatsScreen() {
  const { recordsFor, setScreen, tourneys } = useGame();
  const [group, setGroup] = useState<RecordGroup>('competitive');
  const records = recordsFor(group);
  const st = useMemo(() => heroStats(records), [records]);
  const [analysis, setAnalysis] = useState<{ n: number; avg: number | null; byType: Record<string, number>; decisions: DecisionReview[] } | null>(null);
  const [running, setRunning] = useState(false);

  const runAnalysis = () => {
    setRunning(true);
    setTimeout(() => {
      const last = records.slice(-25);
      const decisions: DecisionReview[] = [];
      for (const r of last) decisions.push(...reviewHand(r, 'hero', 350).decisions);
      const scored = decisions.filter((d) => d.score !== null);
      const byType: Record<string, number> = {};
      decisions.forEach((d) => { if (d.mistake) byType[d.mistake] = (byType[d.mistake] ?? 0) + 1; });
      setAnalysis({ n: last.length, avg: scored.length ? scored.reduce((t, d) => t + d.score!, 0) / scored.length : null, byType, decisions });
      setRunning(false);
    }, 30);
  };

  // 누적 손익 그래프
  const series = useMemo(() => { let c = 0; return records.map((r) => { const me = r.startStacks.find((s) => s.id === 'hero'); c += me ? (r.result?.net[me.seat] ?? 0) : 0; return c; }); }, [records]);
  const W = 320, H = 90;
  const min = Math.min(0, ...series), max = Math.max(1, ...series);
  const pts = series.map((v, i) => `${(i / Math.max(1, series.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * H}`).join(' ');

  return (
    <div className="max-w-2xl mx-auto p-3 space-y-3 overflow-y-auto h-full safe-pad" data-testid="stats">
      <div className="flex items-center gap-2"><button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="stats-back">← 뒤로</button><h1 className="text-xl font-bold">통계 대시보드</h1></div>
      <div className="flex gap-2">
        <button className={`btn !min-h-[36px] ${group === 'competitive' ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setGroup('competitive')}>실전/경쟁</button>
        <button className={`btn !min-h-[36px] ${group === 'training' ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setGroup('training')}>훈련 (분리 집계)</button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-800 rounded-lg p-2"><div className="text-xs text-slate-400">플레이 핸드</div><div className="text-xl font-bold" data-testid="stat-hands">{st.hands}</div></div>
        <div className="bg-slate-800 rounded-lg p-2"><div className="text-xs text-slate-400">총 손익</div><div className={`text-xl font-bold ${st.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`} data-testid="stat-net">{st.net.toLocaleString()}</div></div>
        <div className="bg-slate-800 rounded-lg p-2"><div className="text-xs text-slate-400">BB/100 (n={st.hands})</div><div className="text-xl font-bold">{st.bb100 === null ? '-' : st.bb100.toFixed(1)}</div></div>
      </div>
      {series.length > 1 && <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 bg-slate-900 rounded-lg" role="img" aria-label="누적 손익"><polyline points={pts} fill="none" stroke="#38bdf8" strokeWidth="2" /></svg>}
      <table className="w-full text-sm" data-testid="metrics">
        <thead><tr className="text-left text-slate-400 text-xs"><th>지표</th><th className="text-right">값</th><th className="text-right">분자/분모</th></tr></thead>
        <tbody>
          {st.metrics.map((m) => (
            <tr key={m.key} className="border-t border-slate-800" title={m.def}>
              <td className="py-1">{m.label}<div className="text-[10px] text-slate-500">{m.def}</div></td>
              <td className="text-right font-mono">{m.pct === null ? '-' : m.pct.toFixed(1) + '%'}</td>
              <td className="text-right font-mono text-xs text-slate-400">{m.num}/{m.den}{m.den < 30 ? ' ⚠표본적음' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="font-bold">토너먼트 기록</h2>
      {tourneys.length === 0 ? <div className="text-sm text-slate-400">완료한 토너먼트가 없습니다.</div> : (() => {
        const n = tourneys.length;
        const itm = tourneys.filter((x) => x.prize > 0).length;
        const cost = tourneys.reduce((t, x) => t + x.buyIn * x.entries, 0);
        const prize = tourneys.reduce((t, x) => t + x.prize, 0);
        return (
          <div className="text-sm space-y-1" data-testid="tourney-stats">
            <div>ITM {itm}/{n} ({((100 * itm) / n).toFixed(0)}%) · 우승 {tourneys.filter((x) => x.place === 1).length}회 · ROI {cost > 0 ? (((prize - cost) / cost) * 100).toFixed(0) + '%' : '-'} (비용 {cost.toLocaleString()} / 상금 {prize.toLocaleString()}, 가상 칩, n={n})</div>
            {tourneys.slice(-5).reverse().map((x) => <div key={x.date} className="text-xs text-slate-400">{new Date(x.date).toLocaleDateString()} · {x.mode} · {x.place}위/{x.entrants}명 · 상금 {x.prize.toLocaleString()}</div>)}
          </div>
        );
      })()}
      <h2 className="font-bold">포지션별 결과</h2>
      <table className="w-full text-sm"><tbody>
        {st.byPos.map((p) => <tr key={p.label} className="border-t border-slate-800"><td>{p.label}</td><td className="text-right text-xs text-slate-400">{p.hands}핸드</td><td className="text-right font-mono">{p.net.toLocaleString()}</td><td className="text-right font-mono text-xs">{p.bb100.toFixed(0)} BB/100</td></tr>)}
      </tbody></table>
      <div className="space-y-2">
        <button className="btn bg-indigo-700" onClick={runAnalysis} disabled={running || !records.length} data-testid="btn-analyze">{running ? '분석 중…' : '최근 25핸드 판단 품질 분석 (근사)'}</button>
        {analysis && (
          <div className="p-2 rounded-lg bg-slate-800 text-sm space-y-1" data-testid="analysis">
            <div>평균 판단 점수: <b>{analysis.avg === null ? '-' : analysis.avg.toFixed(0)}</b> / 100 (근사, {analysis.decisions.length}개 결정)</div>
            <div>실수 유형: {Object.keys(analysis.byType).length ? Object.entries(analysis.byType).map(([k, v]) => `${k} ${v}회`).join(', ') : '없음'}</div>
            {Object.keys(analysis.byType).length > 0 && <div className="text-sky-200 text-xs">추천 훈련: {Object.keys(analysis.byType).some((k) => k.includes('폴드')) ? '블러프 캐치/팟오즈 스팟 훈련' : '밸류·콜 판단 스팟 훈련'} (훈련 화면)</div>}
            <div className="text-[11px] text-slate-500">점수는 몬테카를로 승률·팟오즈 기반 근사이며 솔버 평가가 아닙니다.</div>
          </div>
        )}
      </div>
    </div>
  );
}
