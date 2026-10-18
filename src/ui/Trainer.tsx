import { useEffect, useState } from 'react';
import { generatePushFold, solvePushFold, PushFoldSpot, PushFoldAnswer, Spot, validateSpot, solveSpot, SpotResult } from '../analysis/drills';
import { cardToString } from '../engine/cards';
import { createRng, randomSeed } from '../engine/rng';
import { loadKV, saveKV } from '../persist/db';
import { useGame } from '../store/useGame';
import { CardView } from './CardView';

interface PFStats { total: number; correct: number; byPos: Record<string, { n: number; c: number }> }

function PushFold() {
  const [spot, setSpot] = useState<PushFoldSpot>(() => generatePushFold(createRng(randomSeed())));
  const [ans, setAns] = useState<{ choice: boolean; a: PushFoldAnswer } | null>(null);
  const [st, setSt] = useState<PFStats>({ total: 0, correct: 0, byPos: {} });
  useEffect(() => { void loadKV<PFStats>('pfStats').then((v) => v && setSt(v)); }, []);
  const choose = (push: boolean) => {
    if (ans) return;
    const a = solvePushFold(spot, createRng(randomSeed()));
    const ok = a.push === push;
    const next: PFStats = { total: st.total + 1, correct: st.correct + (ok ? 1 : 0), byPos: { ...st.byPos, [spot.pos]: { n: (st.byPos[spot.pos]?.n ?? 0) + 1, c: (st.byPos[spot.pos]?.c ?? 0) + (ok ? 1 : 0) } } };
    setSt(next); void saveKV('pfStats', next);
    setAns({ choice: push, a });
  };
  const nextSpot = () => { setAns(null); setSpot(generatePushFold(createRng(randomSeed()))); };
  return (
    <div className="space-y-3" data-testid="pushfold">
      <div className="flex gap-2 items-center"><div className="flex gap-1">{spot.hole.map((c) => <CardView key={c} card={c} size="lg" />)}</div>
        <div className="text-sm"><div>포지션 <b data-testid="pf-pos">{spot.pos}</b> · 스택 <b data-testid="pf-bbs">{spot.bbs}BB</b></div><div>앤티 {spot.ante ? '1/8 BB' : '없음'} · 내 뒤 {spot.behind}명 (모두 폴드로 돌아옴)</div></div></div>
      <div className="flex gap-2"><button className="btn flex-1 bg-amber-600 text-black" onClick={() => choose(true)} disabled={!!ans} data-testid="pf-push">올인(푸시)</button><button className="btn flex-1 bg-rose-700" onClick={() => choose(false)} disabled={!!ans} data-testid="pf-fold">폴드</button></div>
      {ans && (
        <div className="p-3 rounded-lg bg-slate-800 text-sm space-y-1" data-testid="pf-result">
          <b className={ans.choice === ans.a.push ? 'text-emerald-300' : 'text-rose-300'}>{ans.choice === ans.a.push ? '정답 (모델 기준)' : '오답 (모델 기준)'}</b>
          <div>모델 권장: {ans.a.push ? '푸시' : '폴드'} · EV(푸시) {ans.a.evPush.toFixed(2)}BB vs EV(폴드) {ans.a.evFold.toFixed(2)}BB</div>
          <div className="text-xs text-slate-300">가정: 상대가 상위 {(ans.a.callPct * 100).toFixed(0)}%로 콜 → 전원 폴드 확률 {(ans.a.foldProb * 100).toFixed(0)}%, 콜받을 때 승률 {(ans.a.equityVsCall * 100).toFixed(0)}% (몬테카를로)</div>
          <div className="text-[11px] text-slate-500">⚠ 단순 EV 모델의 근사입니다. 내시 균형/솔버 차트가 아닙니다.</div>
          <button className="btn !min-h-[38px] bg-sky-700" onClick={nextSpot} data-testid="pf-next">다음 문제</button>
        </div>
      )}
      <div className="text-xs text-slate-400" data-testid="pf-stats">누적: {st.correct}/{st.total} 정답 {st.total ? `(${((100 * st.correct) / st.total).toFixed(0)}%)` : ''} · {Object.entries(st.byPos).map(([k, v]) => `${k} ${v.c}/${v.n}`).join(', ')}</div>
    </div>
  );
}

function SpotTrainer() {
  const [s, setS] = useState<Spot>({ id: 'new', hole: 'Ah Kd', board: 'Ks 7d 2c', pos: 'BTN', opponents: 1, stackBB: 100, potBB: 10, toCallBB: 5, villainPct: 0.3 });
  const [res, setRes] = useState<SpotResult | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const [saved, setSaved] = useState<Spot[]>([]);
  useEffect(() => { void loadKV<Spot[]>('spots').then((v) => v && setSaved(v)); }, []);
  const run = (sp = s) => {
    const e = validateSpot(sp);
    setErrs(e);
    if (e.length) { setRes(null); return; }
    setRes(solveSpot(sp, createRng(randomSeed())));
  };
  const save = () => { if (validateSpot(s).length) return; const n = [...saved, { ...s, id: String(Date.now()) }]; setSaved(n); void saveKV('spots', n); };
  const upd = (p: Partial<Spot>) => setS({ ...s, ...p });
  const field = 'bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 w-full';
  return (
    <div className="space-y-2" data-testid="spot">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label>홀카드<input className={field} value={s.hole} onChange={(e) => upd({ hole: e.target.value })} data-testid="spot-hole" /></label>
        <label>보드 (0/3/4/5장)<input className={field} value={s.board} onChange={(e) => upd({ board: e.target.value })} data-testid="spot-board" /></label>
        <label>포지션<input className={field} value={s.pos} onChange={(e) => upd({ pos: e.target.value })} /></label>
        <label>상대 수<input className={field} inputMode="numeric" value={s.opponents} onChange={(e) => upd({ opponents: Number(e.target.value) || 0 })} data-testid="spot-opps" /></label>
        <label>유효 스택(BB)<input className={field} inputMode="numeric" value={s.stackBB} onChange={(e) => upd({ stackBB: Number(e.target.value) || 0 })} /></label>
        <label>현재 팟(BB)<input className={field} inputMode="decimal" value={s.potBB} onChange={(e) => upd({ potBB: Number(e.target.value) || 0 })} data-testid="spot-pot" /></label>
        <label>콜할 금액(BB)<input className={field} inputMode="decimal" value={s.toCallBB} onChange={(e) => upd({ toCallBB: Number(e.target.value) || 0 })} data-testid="spot-call" /></label>
        <label>상대 레인지 상위 {(s.villainPct * 100).toFixed(0)}%<input type="range" min={0.03} max={1} step={0.01} value={s.villainPct} onChange={(e) => upd({ villainPct: Number(e.target.value) })} className="w-full" data-testid="spot-range" /></label>
      </div>
      <div className="flex gap-2"><button className="btn flex-1 bg-sky-700" onClick={() => run()} data-testid="spot-run">분석</button><button className="btn bg-slate-700" onClick={save} data-testid="spot-save">저장</button></div>
      {errs.length > 0 && <div className="text-rose-300 text-sm" data-testid="spot-errors">{errs.join(' · ')}</div>}
      {res && (
        <div className="p-3 rounded-lg bg-slate-800 text-sm space-y-1" data-testid="spot-result">
          <div>{res.handKey} (프리플랍 상위 {(res.handPct * 100).toFixed(0)}%) · 승률 <b>{(res.equity * 100).toFixed(1)}%</b> ±{(res.se * 200).toFixed(1)}%p (몬테카를로 추정)</div>
          {res.need !== null && <div>필요 승률(정확한 팟오즈) <b>{(res.need * 100).toFixed(1)}%</b> · 모델 콜 EV {res.evCallBB!.toFixed(2)}BB</div>}
          <div className="text-emerald-200">→ {res.advice}</div>
          <div className="text-[11px] text-slate-500">상대 레인지는 사용자가 지정한 가정입니다. 솔버 결과가 아닙니다.</div>
        </div>
      )}
      {saved.length > 0 && <div className="text-xs"><b>저장된 상황</b>{saved.map((x) => <button key={x.id} className="block underline text-sky-300" onClick={() => { setS(x); run(x); }}>{x.hole} / {x.board || '프리플랍'} / 팟{x.potBB} 콜{x.toCallBB}</button>)}</div>}
    </div>
  );
}

export function TrainerScreen() {
  const { setScreen } = useGame();
  const [tab, setTab] = useState<'pf' | 'spot'>('pf');
  return (
    <div className="max-w-xl mx-auto p-3 space-y-3 overflow-y-auto h-full safe-pad" data-testid="trainer">
      <div className="flex items-center gap-2"><button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="trainer-back">← 뒤로</button><h1 className="text-xl font-bold">훈련</h1></div>
      <div className="flex gap-2"><button className={`btn !min-h-[36px] ${tab === 'pf' ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setTab('pf')} data-testid="tab-pf">푸시/폴드</button><button className={`btn !min-h-[36px] ${tab === 'spot' ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setTab('spot')} data-testid="tab-spot">상황별 핸드</button></div>
      {tab === 'pf' ? <PushFold /> : <SpotTrainer />}
      <p className="text-[11px] text-slate-500 hidden">{cardToString(0)}</p>
    </div>
  );
}
