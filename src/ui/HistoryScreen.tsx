import { useMemo, useState } from 'react';
import { applyAction, legalActions } from '../engine/game';
import { replayRecord } from '../engine/replay';
import { cardToString } from '../engine/cards';
import { HandRecord } from '../engine/types';
import { Session } from '../game/session';
import { RecordGroup, useGame } from '../store/useGame';
import { TableView } from './Table';
import { ReviewPanel } from './Review';
import { decide } from '../ai/decide';
import { observe } from '../ai/observation';
import { createRng } from '../engine/rng';
import { exportSession, importSession, loadKV, saveKV } from '../persist/db';
import { useEffect } from 'react';

function pseudoSession(base: Session | null, g: ReturnType<typeof replayRecord>): Session {
  return { ...(base as Session), game: g, aiBySeat: base?.aiBySeat ?? {} } as Session;
}

export function HistoryScreen() {
  const { recordsFor, setScreen, session, replaceSession, setSettings, settings } = useGame();
  const [group, setGroup] = useState<RecordGroup>('competitive');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<HandRecord | null>(null);
  const [step, setStep] = useState(0);
  const [branch, setBranch] = useState<ReturnType<typeof replayRecord> | null>(null);
  const [msg, setMsg] = useState('');
  const [favs, setFavs] = useState<string[]>([]);
  useEffect(() => { void loadKV<string[]>('favorites').then((v) => v && setFavs(v)); }, []);
  const favKey = (r: HandRecord) => `${r.seed}-${r.handNo}`;
  const toggleFav = (r: HandRecord) => { const k = favKey(r); const n = favs.includes(k) ? favs.filter((x) => x !== k) : [...favs, k]; setFavs(n); void saveKV('favorites', n); };
  const [onlyFav, setOnlyFav] = useState(false);
  const records = recordsFor(group);
  const list = useMemo(() => records.map((r, i) => ({ r, i })).filter(({ r }) => {
    if (onlyFav && !favs.includes(`${r.seed}-${r.handNo}`)) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    const me = r.startStacks.find((s) => s.id === 'hero');
    const net = me ? r.result?.net[me.seat] ?? 0 : 0;
    if (t === '+' || t === '승') return net > 0;
    if (t === '-' || t === '패') return net < 0;
    const cards = [...r.board, ...(me ? r.holes[me.seat] ?? [] : [])].map(cardToString).join(' ').toLowerCase();
    return cards.includes(t) || String(r.handNo) === t;
  }).reverse(), [records, q, onlyFav, favs]);

  const exportNow = () => {
    if (!session) return;
    const blob = new Blob([exportSession(session)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `poker-arena-${Date.now()}.json`; a.click();
  };
  const onImport = async (f: File | undefined) => {
    if (!f) return;
    const r = importSession(await f.text());
    if (r.ok) { replaceSession(r.session); setMsg('가져오기 성공'); } else setMsg('가져오기 거부: ' + r.errors.slice(0, 3).join(' / '));
  };

  if (sel) {
    const total = sel.actions.length;
    const g = branch ?? replayRecord(sel, step);
    const heroSeat = sel.startStacks.find((s) => s.id === 'hero')?.seat ?? 0;
    const ps = pseudoSession(session, g);
    // 리플레이에서는 모든 홀카드를 공개 (복기 전용)
    const bsess = { ...ps };
    const revealAll = true;
    void revealAll;
    const heroTurn = g.toAct === heroSeat && legalActions(g);
    const branchAct = (a: Parameters<typeof applyAction>[1]) => {
      let ng = applyAction(g, a);
      // 분석 브랜치: 상대는 중립 AI(Balanced, 난이도5)로 진행, 원본 기록은 변경하지 않음
      let guard = 0;
      while (ng.toAct !== null && ng.toAct !== heroSeat && guard++ < 200) {
        const obs = observe(ng, ng.toAct);
        const d = decide(obs, { profileId: 'Balanced', difficulty: 3 }, {}, createRng(ng.events.length * 7 + 1), 1);
        try { ng = applyAction(ng, d.action); } catch { ng = applyAction(ng, obs.legal.canCheck ? { type: 'check' } : { type: 'fold' }); }
      }
      setBranch(ng);
    };
    const la = heroTurn ? legalActions(g) : null;
    return (
      <div className="max-w-3xl mx-auto p-2 space-y-2 overflow-y-auto h-full safe-pad" data-testid="replay">
        <div className="flex items-center gap-2"><button className="btn !min-h-[36px] bg-slate-700" onClick={() => { setSel(null); setBranch(null); }} data-testid="replay-back">← 목록</button><b>핸드 #{sel.handNo} 리플레이</b><button className="ml-auto btn !min-h-[36px] bg-slate-700" onClick={() => toggleFav(sel)} data-testid="btn-fav">{favs.includes(favKey(sel)) ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기'}</button></div>
        <div className="relative"><TableView sess={bsess} revealAll /></div>
        <div className="flex items-center gap-2">
          <button className="btn !min-h-[36px] bg-slate-700" onClick={() => { setBranch(null); setStep(Math.max(0, step - 1)); }} data-testid="replay-prev">◀</button>
          <input type="range" min={0} max={total} value={step} className="flex-1" onChange={(e) => { setBranch(null); setStep(Number(e.target.value)); }} aria-label="진행" />
          <button className="btn !min-h-[36px] bg-slate-700" onClick={() => { setBranch(null); setStep(Math.min(total, step + 1)); }} data-testid="replay-next">▶</button>
          <span className="text-xs w-14 text-right">{step}/{total}</span>
        </div>
        {branch && <div className="p-2 rounded bg-indigo-900/60 text-xs" data-testid="branch-note">분석 브랜치 (원본 기록은 변경되지 않음){branch.street === 'complete' ? ` — 결과: 내 손익 ${(branch.result?.net[heroSeat] ?? 0)}` : ''} <button className="underline ml-2" onClick={() => setBranch(null)}>원본으로</button></div>}
        {la && (
          <div className="flex gap-2 flex-wrap items-center" data-testid="branch-actions">
            <span className="text-xs text-slate-300">다른 행동 실험:</span>
            {la.canFold && <button className="btn !min-h-[36px] bg-rose-700" onClick={() => branchAct({ type: 'fold' })}>폴드</button>}
            {la.canCheck && <button className="btn !min-h-[36px] bg-sky-700" onClick={() => branchAct({ type: 'check' })}>체크</button>}
            {la.canCall && <button className="btn !min-h-[36px] bg-sky-700" onClick={() => branchAct({ type: 'call' })}>콜 {la.callAmount}</button>}
            {la.canRaise && [0.5, 1].map((f) => { const to = Math.min(la.maxTo, Math.max(la.minTo, Math.round(g.currentBet + f * (la.pot + la.callAmount)))); return <button key={f} className="btn !min-h-[36px] bg-emerald-700" onClick={() => branchAct({ type: la.isBet ? 'bet' : 'raise', to })}>{f === 1 ? '팟' : '½팟'} → {to}</button>; })}
            {la.canRaise && <button className="btn !min-h-[36px] bg-amber-600 text-black" onClick={() => branchAct({ type: 'allin' })}>올인</button>}
          </div>
        )}
        <ReviewPanel rec={sel} defaultLevel="detail" sims={600} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-3 space-y-2 overflow-y-auto h-full safe-pad" data-testid="history">
      <div className="flex items-center gap-2"><button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="history-back">← 뒤로</button><h1 className="text-xl font-bold">핸드 기록</h1></div>
      <div className="flex gap-2 flex-wrap">
        <button className={`btn !min-h-[36px] ${group === 'competitive' ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setGroup('competitive')}>실전/경쟁</button>
        <button className={`btn !min-h-[36px] ${group === 'training' ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setGroup('training')}>훈련</button>
        <button className="btn !min-h-[36px] bg-slate-700 text-sm" onClick={exportNow} disabled={!session} data-testid="btn-export">내보내기(JSON)</button>
        <label className="btn !min-h-[36px] bg-slate-700 text-sm cursor-pointer">가져오기<input type="file" accept="application/json" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} data-testid="import-file" /></label>
      </div>
      {msg && <div className="text-xs text-amber-200" data-testid="history-msg">{msg}</div>}
      <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} data-testid="only-fav" /> ★ 즐겨찾기만 (실수 핸드 복습용)</label>
      <input className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2" placeholder="검색: 카드(예: As), 핸드번호, + 승 / - 패" value={q} onChange={(e) => setQ(e.target.value)} data-testid="history-search" />
      <ul className="space-y-1">
        {list.map(({ r }) => {
          const me = r.startStacks.find((s) => s.id === 'hero');
          const net = me ? r.result?.net[me.seat] ?? 0 : 0;
          return (
            <li key={r.handNo + '-' + r.seed}>
              <button className="w-full text-left p-2 rounded bg-slate-800 hover:bg-slate-700 flex gap-2 text-sm" onClick={() => { setSel(r); setStep(0); setBranch(null); }} data-testid="history-item">
                <span className="w-12 text-slate-400">{favs.includes(`${r.seed}-${r.handNo}`) ? '★' : ''}#{r.handNo}</span>
                <span className="flex-1 truncate">{me ? (r.holes[me.seat] ?? []).map(cardToString).join(' ') : ''} · {r.board.map(cardToString).join(' ')}</span>
                <span className={net > 0 ? 'text-emerald-300' : net < 0 ? 'text-rose-300' : ''}>{net > 0 ? '+' : ''}{net}</span>
              </button>
            </li>
          );
        })}
        {!list.length && <li className="text-slate-400 text-sm">기록이 없습니다.</li>}
      </ul>
      <label className="text-xs text-slate-400 flex items-center gap-1"><input type="checkbox" checked={settings.revealAI} onChange={(e) => setSettings({ revealAI: e.target.checked })} /> AI 성향 표시(훈련용)</label>
    </div>
  );
}
