import { useEffect, useState } from 'react';
import { reviewHand, HandReview } from '../analysis/review';
import { HandRecord } from '../engine/types';

const gradeColor: Record<string, string> = { A: 'bg-emerald-600', B: 'bg-lime-600', C: 'bg-yellow-600', D: 'bg-orange-600', F: 'bg-rose-700' };
type Level = 'simple' | 'detail' | 'expert';

export function ReviewPanel({ rec, defaultLevel = 'simple', sims = 800 }: { rec: HandRecord; defaultLevel?: Level; sims?: number }) {
  const [level, setLevel] = useState<Level>(defaultLevel);
  const [rv, setRv] = useState<HandReview | null>(null);
  useEffect(() => {
    setRv(null);
    const t = setTimeout(() => setRv(reviewHand(rec, 'hero', sims)), 20); // UI 블로킹 최소화
    return () => clearTimeout(t);
  }, [rec, sims]);
  return (
    <div className="space-y-2 text-sm" data-testid="review">
      <div className="flex gap-1">
        {(['simple', 'detail', 'expert'] as Level[]).map((l) => (
          <button key={l} className={`btn !min-h-[34px] !py-1 text-xs ${level === l ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setLevel(l)} data-testid={`review-${l}`}>{{ simple: '간단', detail: '상세', expert: '전문가' }[l]}</button>
        ))}
      </div>
      {!rv ? <div className="text-slate-400">분석 중…</div> : (
        <>
          <ul className="list-disc pl-5 text-slate-200">{rv.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
          <div className="text-amber-200">{rv.resultVsQuality}</div>
          {rv.decisions.length === 0 && <div className="text-slate-400">내 결정이 없는 핸드입니다.</div>}
          {rv.decisions.map((d) => (
            <div key={d.actionIndex} className="rounded-lg bg-slate-800/80 p-2 space-y-1" data-testid="decision">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase text-slate-400 w-14">{d.street}</span>
                <span className="font-semibold">{d.actionLabel}</span>
                {d.grade ? <span className={`ml-auto px-2 rounded text-white text-xs font-bold ${gradeColor[d.grade]}`}>{d.grade} · {d.score} (근사)</span> : <span className="ml-auto text-xs text-slate-400">평가 불가</span>}
              </div>
              {d.mistake && <div className="text-rose-300 text-xs">⚠ {d.mistake}</div>}
              <div className="text-xs text-slate-300">승률 {(d.equity * 100).toFixed(0)}% (추정){d.potOddsNeed !== null ? ` · 필요 ${(d.potOddsNeed * 100).toFixed(0)}% (정확)` : ''}</div>
              {level !== 'simple' && <ul className="list-disc pl-5 text-xs text-slate-300">{d.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
              {level === 'expert' && (
                <div className="text-xs text-slate-300 space-y-0.5">
                  {d.alternatives.length > 0 && <div>대안: {d.alternatives.join(' / ')}</div>}
                  <div>GTO 관점: 솔버 데이터가 없어 GTO 빈도는 제공하지 않습니다. 위 수치는 몬테카를로·팟오즈 기반 근사입니다.</div>
                  <div>익스플로잇 관점: 상대 레인지 추정이 틀리면 결론이 바뀝니다 (불확실성 ±{(d.rangeUncertainty * 100).toFixed(0)}%p).</div>
                </div>
              )}
              {level !== 'simple' && <div className="text-xs text-sky-200">교훈: {d.lesson}</div>}
            </div>
          ))}
          <div className="text-[11px] text-slate-500">{rv.approxNotice}</div>
        </>
      )}
    </div>
  );
}
