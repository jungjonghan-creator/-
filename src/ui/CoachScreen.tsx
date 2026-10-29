import { useEffect, useMemo, useRef, useState } from 'react';
import { deepReport, DeepReport, PlayerMeta } from '../analysis/coach';
import { rosterById, rosterByName } from '../economy/roster';
import { useGame } from '../store/useGame';

const sevLabel = ['', '낮음', '중간', '높음'];
const sevCls = ['', 'bg-slate-600', 'bg-amber-600', 'bg-rose-600'];

function LineChart({ a, b }: { a: number[]; b: number[] }) {
  const W = 320, H = 110, pad = 6;
  const all = [0, ...a, ...b];
  const min = Math.min(...all), max = Math.max(...all);
  const x = (i: number) => pad + (i / Math.max(1, a.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const pts = (s: number[]) => s.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 bg-slate-900 rounded-lg" role="img" aria-label="누적 손익: 실제와 올인 EV 보정">
      <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="#334155" strokeDasharray="3 3" />
      <polyline points={pts(b)} fill="none" stroke="#a78bfa" strokeWidth="2" />
      <polyline points={pts(a)} fill="none" stroke="#38bdf8" strokeWidth="2" />
      <text x={W - pad} y={y(a[a.length - 1]) - 4} textAnchor="end" fontSize="9" fill="#38bdf8">{a[a.length - 1].toFixed(0)}BB</text>
      <text x={W - pad} y={y(b[b.length - 1]) + 10} textAnchor="end" fontSize="9" fill="#a78bfa">{b[b.length - 1].toFixed(0)}BB</text>
    </svg>
  );
}

export function CoachScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const { recordsFor, session, setScreen } = useGame();
  const records = recordsFor('competitive');
  const [report, setReport] = useState<DeepReport | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const run = useRef(0);

  const players = useMemo<PlayerMeta[]>(() => {
    const m = new Map<string, PlayerMeta>();
    records.forEach((r) => r.startStacks.forEach((s) => { if (!m.has(s.id)) m.set(s.id, { id: s.id, name: s.name, profileId: rosterById(s.id)?.profileId ?? rosterByName(s.name)?.profileId }); }));
    session?.game.players.forEach((p, i) => { const prev = m.get(p.id); m.set(p.id, { id: p.id, name: p.name, profileId: session.aiById?.[p.id]?.profileId ?? session.aiBySeat[i]?.profileId ?? prev?.profileId }); });
    return [...m.values()];
  }, [records, session]);

  const start = () => {
    const my = ++run.current;
    setRunning(true); setProgress(0); setReport(null);
    deepReport(records, players, { maxReviewHands: 120, sims: 300, onProgress: (p) => { if (run.current === my) setProgress(p); } })
      .then((r) => { if (run.current === my) { setReport(r); setRunning(false); } })
      .catch(() => setRunning(false));
  };
  useEffect(() => { if (records.length >= 8) start(); return () => { run.current++; }; }, []); // eslint-disable-line

  return (
    <div className={`max-w-2xl mx-auto p-3 space-y-3 ${embedded ? '' : 'overflow-y-auto h-full safe-pad'}`} data-testid="coach">
      <div className="flex items-center gap-2">
        {!embedded && <button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen(session ? 'table' : 'menu')} data-testid="coach-back">← 뒤로</button>}
        <h1 className="text-xl font-bold">{embedded ? '종합 리포트' : '분석실'}</h1>
        <button className="btn !min-h-[36px] ml-auto bg-slate-700 text-sm" onClick={start} disabled={running || records.length < 8} data-testid="coach-rerun">다시 분석</button>
      </div>
      {records.length < 8 && <div className="p-3 rounded-lg bg-slate-800 text-sm" data-testid="coach-empty">분석에는 최소 8핸드가 필요합니다. 현재 {records.length}핸드 — 조금 더 플레이한 뒤 돌아오세요.</div>}
      {running && (
        <div className="space-y-1" data-testid="coach-progress">
          <div className="text-sm text-slate-300">당신의 모든 결정을 하나씩 다시 계산하는 중… {Math.round(progress * 100)}%</div>
          <div className="h-2 rounded bg-slate-700 overflow-hidden"><div className="h-full bg-sky-500 transition-all" style={{ width: `${progress * 100}%` }} /></div>
        </div>
      )}
      {report && (
        <>
          <section className="p-3 rounded-xl bg-slate-900 border border-slate-700 space-y-2" data-testid="coach-summary">
            <div className="text-xs text-slate-400">요약 · {report.totalHands}핸드 중 최근 {report.analyzedHands}핸드, 결정 {report.decisions}개 분석</div>
            <p className="text-sm leading-relaxed">{report.summary}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">판단 점수(근사)</div><div className="text-xl font-bold">{report.avgScore === null ? '-' : report.avgScore.toFixed(0)}</div></div>
              <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">추정 EV 손실</div><div className="text-xl font-bold text-rose-300">{report.evLossBB.toFixed(1)}BB</div></div>
              <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">BB/100</div><div className="text-xl font-bold">{report.bb100 === null ? '-' : report.bb100.toFixed(1)}</div></div>
            </div>
            <div className="flex gap-1 text-[11px]">
              {(['A', 'B', 'C', 'D', 'F'] as const).map((g) => <span key={g} className="px-2 py-0.5 rounded bg-slate-800">{g} {report.gradeDist[g]}</span>)}
            </div>
          </section>

          {report.series.actual.length > 1 && (
            <section className="space-y-1" data-testid="coach-luck">
              <h2 className="font-bold text-sm">운 vs 실력 — 올인 EV 보정</h2>
              <LineChart a={report.series.actual} b={report.series.adjusted} />
              <div className="flex gap-3 text-[11px] text-slate-400"><span><b className="text-sky-400">━</b> 실제 누적 손익</span><span><b className="text-violet-400">━</b> 올인을 기대값으로 바꾼 손익</span></div>
              <p className="text-sm text-slate-300">{report.luck.hands >= 3 ? `올인 승부 ${report.luck.hands}번에서 실제 ${report.luck.actualBB.toFixed(1)}BB, 기대 ${report.luck.expectedBB.toFixed(1)}BB — 운 ${report.luck.luckBB >= 0 ? '+' : ''}${report.luck.luckBB.toFixed(1)}BB. ${Math.abs(report.luck.luckBB) < 5 ? '결과는 실력에 가깝습니다.' : report.luck.luckBB < 0 ? '결과가 실력보다 나쁘게 나왔습니다.' : '결과가 실력보다 좋게 나왔습니다.'}` : '올인 승부 표본이 적어 운 보정은 아직 의미가 없습니다.'}</p>
            </section>
          )}

          <section className="space-y-2" data-testid="coach-leaks">
            <h2 className="font-bold text-sm">누수 진단</h2>
            {report.leaks.length === 0 && <div className="text-sm text-slate-300">뚜렷한 누수가 발견되지 않았습니다. 표본을 더 쌓아 보세요.</div>}
            {report.leaks.map((l) => (
              <div key={l.id} className="p-3 rounded-lg bg-slate-800/80 space-y-1" data-testid="leak">
                <div className="flex items-center gap-2"><span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${sevCls[l.severity]}`}>중요도 {sevLabel[l.severity]}</span><b className="text-sm">{l.title}</b></div>
                <div className="text-xs text-slate-400">근거: {l.evidence}</div>
                <div className="text-sm text-slate-100">{l.advice}</div>
                {l.drill && <button className="btn !min-h-[32px] !py-1 text-xs bg-indigo-700" onClick={() => setScreen('trainer')}>관련 훈련하기</button>}
              </div>
            ))}
          </section>

          {report.strengths.length > 0 && (
            <section className="space-y-1" data-testid="coach-strengths">
              <h2 className="font-bold text-sm">잘하고 있는 점</h2>
              <ul className="list-disc pl-5 text-sm text-emerald-200">{report.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </section>
          )}

          <section className="space-y-1">
            <h2 className="font-bold text-sm">스트리트·포지션별 판단 점수</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-slate-800/70 rounded-lg p-2">{report.scoreByStreet.map((s) => <div key={s.street} className="flex justify-between"><span>{({ preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' } as Record<string, string>)[s.street]}</span><span className="font-mono">{s.avg.toFixed(0)} <span className="text-xs text-slate-500">n={s.n}</span></span></div>)}</div>
              <div className="bg-slate-800/70 rounded-lg p-2">{report.scoreByPosition.slice(0, 6).map((s) => <div key={s.pos} className="flex justify-between"><span>{s.pos}</span><span className="font-mono">{s.avg.toFixed(0)} <span className="text-xs text-slate-500">{s.netBB100 === null ? '' : `${s.netBB100.toFixed(0)}bb/100`}</span></span></div>)}</div>
            </div>
            {report.trend.length > 1 && <div className="text-xs text-slate-400" data-testid="coach-trend">구간별 판단 점수 추이: {report.trend.map((t) => t.score.toFixed(0)).join(' → ')}</div>}
          </section>

          <section className="space-y-1" data-testid="coach-preflop">
            <h2 className="font-bold text-sm">포지션별 프리플랍 참여율 (VPIP)</h2>
            {report.preflop.map((p) => (
              <div key={p.pos} className="flex items-center gap-2 text-xs">
                <span className="w-12">{p.pos}</span>
                <div className="relative flex-1 h-3 bg-slate-800 rounded overflow-hidden">
                  <div className="absolute inset-y-0 bg-emerald-900/70" style={{ left: `${p.range[0] * 100}%`, width: `${(p.range[1] - p.range[0]) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-sky-500/80" style={{ width: `${Math.min(100, p.vpip * 100)}%`, height: '40%', top: '30%' }} />
                </div>
                <span className="w-24 text-right">{(p.vpip * 100).toFixed(0)}% <span className="text-slate-500">{p.verdict === 'tight' ? '타이트' : p.verdict === 'loose' ? '루즈' : p.verdict === 'ok' ? '적정' : `n=${p.hands}`}</span></span>
              </div>
            ))}
            <div className="text-[11px] text-slate-500">초록 띠 = 권장 범위(근사 기준). 파란 막대 = 내 VPIP.</div>
          </section>

          <section className="space-y-1" data-testid="coach-tilt">
            <h2 className="font-bold text-sm">멘탈 점검</h2>
            <div className="text-sm text-slate-200">{report.tilt.verdict}</div>
            {report.tilt.vpipAfter !== null && report.tilt.vpipBase !== null && <div className="text-xs text-slate-500">큰 손실(−20BB) {report.tilt.triggers}회 · 직후 5핸드 VPIP {(report.tilt.vpipAfter * 100).toFixed(0)}% vs 평소 {(report.tilt.vpipBase * 100).toFixed(0)}%</div>}
          </section>

          {report.opponents.length > 0 && (
            <section className="space-y-2" data-testid="coach-opponents">
              <h2 className="font-bold text-sm">상대별 공략</h2>
              {report.opponents.map((o) => (
                <div key={o.id} className="p-2 rounded-lg bg-slate-800/70 text-sm space-y-0.5">
                  <div className="flex justify-between"><b>{o.name}</b><span className={o.netBB >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{o.netBB >= 0 ? '+' : ''}{o.netBB.toFixed(0)}BB <span className="text-xs text-slate-500">맞대결 {o.hands}</span></span></div>
                  <div className="text-xs text-slate-400">관찰: VPIP {o.vpip === null ? '-' : (o.vpip * 100).toFixed(0) + '%'} · PFR {o.pfr === null ? '-' : (o.pfr * 100).toFixed(0) + '%'} · 공격성 {o.af === null ? '-' : (o.af * 100).toFixed(0) + '%'} (표본 {o.sample}핸드)</div>
                  <div className="text-slate-200">{o.advice}</div>
                </div>
              ))}
            </section>
          )}

          <section className="space-y-2" data-testid="coach-plan">
            <h2 className="font-bold text-sm">다음 100핸드 훈련 계획</h2>
            {report.plan.map((p, i) => (
              <div key={i} className="p-3 rounded-lg bg-indigo-950/50 border border-indigo-800 space-y-1">
                <b className="text-sm">{i + 1}. {p.title}</b>
                {p.steps.map((s, k) => <div key={k} className="text-sm text-slate-200">· {s}</div>)}
              </div>
            ))}
          </section>
          <div className="text-[11px] text-slate-500 pb-6">모든 점수와 EV는 몬테카를로 승률·팟오즈·휴리스틱 범위 기준의 근사입니다. 솔버 결과가 아니며, 표본이 적을수록 불확실합니다.</div>
        </>
      )}
    </div>
  );
}
