import { useEffect, useRef, useState } from 'react';
import { allInLuck, quickCoach, QuickCoach, TourneyCtx } from '../analysis/coach';
import { reviewHand } from '../analysis/review';
import { createRng } from '../engine/rng';
import { HandRecord } from '../engine/types';
import { useGame } from '../store/useGame';

const TONE: Record<QuickCoach['tone'], { label: string; cls: string }> = {
  good: { label: '코치 노트 · 좋은 판단', cls: 'border-emerald-500/70 bg-emerald-950/40' },
  warn: { label: '코치 노트 · 개선 포인트', cls: 'border-amber-500/70 bg-amber-950/40' },
  luck: { label: '코치 노트 · 운의 영향', cls: 'border-sky-500/70 bg-sky-950/40' },
  neutral: { label: '코치 노트', cls: 'border-slate-600 bg-slate-900/60' },
};

/** 핸드가 끝나면 자동으로 뜨는 짧은 피드백. 상세 복기/분석실로 이어진다. */
export function CoachCard({ rec, onDetail, detailOpen, tctx }: { rec: HandRecord; onDetail: () => void; detailOpen: boolean; tctx?: TourneyCtx }) {
  const { setScreen } = useGame();
  const [q, setQ] = useState<QuickCoach | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (q) ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }, [q]);
  useEffect(() => {
    setQ(null);
    const t = setTimeout(() => {
      const seat = rec.startStacks.find((s) => s.id === 'hero')!.seat;
      const rv = reviewHand(rec, 'hero', 700);
      const luck = allInLuck(rec, seat, createRng(rec.seed), 1800);
      setQ(quickCoach(rec, rv, luck, tctx));
    }, 30);
    return () => clearTimeout(t);
  }, [rec]);
  if (!q) return <div className="rounded-lg border border-slate-700 p-3 text-sm text-slate-400" data-testid="coach-loading">코치가 핸드를 살펴보는 중…</div>;
  const tone = TONE[q.tone];
  return (
    <div ref={ref} className={`rounded-lg border p-3 space-y-1.5 ${tone.cls}`} data-testid="coach-card" data-tone={q.tone}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{tone.label}</div>
      <div className="font-bold text-base" data-testid="coach-headline">{q.headline}</div>
      <ul className="space-y-1 text-sm text-slate-200 list-disc pl-5">{q.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
      <div className="flex gap-2 pt-1">
        <button className="btn !min-h-[34px] !py-1 bg-slate-700 text-xs" onClick={onDetail} data-testid="coach-detail">{detailOpen ? '상세 복기 닫기' : '상세 복기 열기'}</button>
        <button className="btn !min-h-[34px] !py-1 bg-slate-700 text-xs" onClick={() => setScreen('coach')} data-testid="coach-lab">분석실 열기</button>
      </div>
      <div className="text-[10px] text-slate-500">승률·EV는 몬테카를로/팟오즈 기반 근사이며 솔버 결과가 아닙니다.</div>
    </div>
  );
}
