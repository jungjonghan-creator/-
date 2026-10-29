import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../store/useGame';
import { CoachScreen } from './CoachScreen';
import { CardView } from './CardView';
import { Card, cardToString, parseCards, newDeck } from '../engine/cards';
import { createRng, randomSeed } from '../engine/rng';
import { analyzeBoard, bubbleFactor, gridKeys, icmLab, makeSpotQuestion, PfAction, PfOptions, POS_BY_SEATS, preflopGrid, PF_STACKS, realSpotsFrom, RIGOR_LABEL, TrainQuestion, TRAINING_RULES, TrainingAttempt, verdictOfTraining } from '../analysis/lab';
import { DecisionReview, reviewHand } from '../analysis/review';
import { solveSpot, Spot } from '../analysis/drills';
import { loadKV, saveKV } from '../persist/db';
import { verifyWallet, summarize } from '../economy/wallet';
import { HandRecord } from '../engine/types';
import { estimate } from '../ai/opponentModel';
import { rosterById } from '../economy/roster';
import { playerById } from '../world/cast';
import { payoutStructure } from '../game/icm';

type Tab = 'report' | 'replay' | 'preflop' | 'postflop' | 'icm' | 'weak' | 'train' | 'opp' | 'audit';
const TABS: [Tab, string][] = [['report', '종합 리포트'], ['replay', '리플레이·복기'], ['preflop', '프리플랍'], ['postflop', '포스트플랍'], ['icm', '토너먼트·ICM'], ['weak', '약점 지도'], ['train', '맞춤 훈련'], ['opp', '상대 데이터'], ['audit', '경제 감사']];

const RigorBadge = ({ r }: { r: keyof typeof RIGOR_LABEL }) => <span className={`text-[10px] px-1.5 py-0.5 rounded ${r === 'exact' ? 'bg-emerald-800' : r === 'sampled' ? 'bg-sky-800' : 'bg-amber-800'}`} data-testid={`rigor-${r}`}>{RIGOR_LABEL[r]}</span>;

// ───────── 프리플랍 연구소 ─────────
const ACT_CLS: Record<PfAction, string> = { fold: 'bg-slate-800 text-slate-500', call: 'bg-emerald-700 text-white', raise: 'bg-rose-700 text-white', jam: 'bg-amber-500 text-black' };
function PreflopLab() {
  const [o, setO] = useState<PfOptions>({ scenario: 'rfi', pos: 'CO', seats: 9, stackBB: 100, ante: false });
  const posList = POS_BY_SEATS[o.seats] ?? POS_BY_SEATS[9];
  const pos = posList.includes(o.pos) ? o.pos : posList[Math.max(0, posList.length - 3)];
  const g = useMemo(() => preflopGrid({ ...o, pos }), [o, pos]);
  const keys = gridKeys();
  const sel = 'rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm';
  return (
    <div className="space-y-2" data-testid="lab-preflop">
      <div className="flex items-center gap-2"><b>프리플랍 연구소</b><RigorBadge r={g.rigor} /></div>
      <div className="grid grid-cols-2 gap-2">
        <select className={sel} value={o.scenario} onChange={(e) => setO({ ...o, scenario: e.target.value as PfOptions['scenario'] })} aria-label="상황" data-testid="pf-scenario"><option value="rfi">오픈 레이즈 (RFI)</option><option value="bbDefend">BB 방어 (상대 오픈 포지션 선택)</option><option value="vs3bet">내 오픈이 3벳 당함</option><option value="pushfold">푸시/폴드 (숏스택)</option></select>
        <select className={sel} value={o.seats} onChange={(e) => setO({ ...o, seats: Number(e.target.value) })} aria-label="인원" data-testid="pf-seats">{[2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}인 테이블</option>)}</select>
        <select className={sel} value={pos} onChange={(e) => setO({ ...o, pos: e.target.value })} aria-label="포지션" data-testid="pf-pos-select">{posList.filter((p) => o.scenario === 'bbDefend' ? p !== 'BB' : true).map((p) => <option key={p}>{p}</option>)}</select>
        <select className={sel} value={o.stackBB} onChange={(e) => setO({ ...o, stackBB: Number(e.target.value) })} aria-label="스택" data-testid="pf-stack">{PF_STACKS.map((n) => <option key={n} value={n}>{n}BB</option>)}</select>
      </div>
      <label className="text-xs flex gap-2 items-center"><input type="checkbox" checked={o.ante} onChange={(e) => setO({ ...o, ante: e.target.checked })} data-testid="pf-ante" /> 앤티 있음 (BB 앤티)</label>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }} data-testid="pf-grid" role="grid" aria-label="13×13 핸드 격자">
        {g.cells.flat().map((c) => <div key={c.key} role="gridcell" title={`${c.key} 상위 ${(c.pct * 100).toFixed(1)}%`} className={`text-center rounded-sm text-[8px] sm:text-[10px] leading-6 sm:leading-7 ${ACT_CLS[c.action]}`} data-action={c.action}>{c.key.replace('s', 's').slice(0, 3)}</div>)}
      </div>
      <div className="flex gap-3 text-[11px] flex-wrap"><span className="text-rose-300">■ 레이즈 {(g.summary.raise * 100).toFixed(0)}%</span><span className="text-emerald-300">■ 콜 {(g.summary.call * 100).toFixed(0)}%</span><span className="text-amber-300">■ 올인 {(g.summary.jam * 100).toFixed(0)}%</span><span className="text-slate-400">■ 폴드</span><span className="text-slate-300" data-testid="pf-total">참여 합계 {(g.summary.total * 100).toFixed(0)}%</span></div>
      <div className="text-[11px] text-slate-500">{g.note} 대각선 = 페어, 위쪽 = 수티드(s), 아래쪽 = 오프수트(o).</div>
    </div>
  );
}

// ───────── 포스트플랍 연구소 ─────────
function PostflopLab() {
  const [txt, setTxt] = useState('Ks 7d 2c');
  const [spr, setSpr] = useState(5);
  const [seed, setSeed] = useState(1);
  let board: Card[] = []; let err = '';
  try { board = parseCards(txt); if (board.length < 3) err = '플랍 3장을 입력하세요'; else if (new Set(board).size !== board.length) err = '중복 카드'; } catch (e) { err = (e as Error).message; }
  const t = !err ? analyzeBoard(board, spr) : null;
  const randomize = () => { const rng = createRng(seed * 7919 + 13); const d = newDeck(); for (let i = d.length - 1; i > 0; i--) { const j = rng.int(i + 1); [d[i], d[j]] = [d[j], d[i]]; } setTxt(d.slice(0, 3).map(cardToString).join(' ')); setSeed(seed + 1); };
  return (
    <div className="space-y-2" data-testid="lab-postflop">
      <div className="flex items-center gap-2"><b>포스트플랍 연구소</b><RigorBadge r="heuristic" /></div>
      <div className="flex gap-2 items-center"><input className="flex-1 rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" value={txt} onChange={(e) => setTxt(e.target.value)} aria-label="플랍" data-testid="board-input" /><button className="btn !min-h-[40px] bg-slate-700 text-sm" onClick={randomize} data-testid="board-random">랜덤 플랍</button></div>
      <label className="text-xs block">SPR(스택/팟) {spr}<input type="range" min={1} max={20} value={spr} onChange={(e) => setSpr(Number(e.target.value))} className="w-full" data-testid="spr-input" /></label>
      {err ? <div className="text-rose-300 text-sm" data-testid="board-error">{err}</div> : t && (
        <div className="space-y-2">
          <div className="flex gap-1">{board.slice(0, 3).map((c) => <CardView key={c} card={c} size="lg" />)}</div>
          <div className="grid grid-cols-2 gap-2 text-sm" data-testid="texture">
            <div className="bg-slate-800 rounded p-2">질감: <b>{t.label}</b> (웻니스 {t.wetness.toFixed(2)})</div>
            <div className="bg-slate-800 rounded p-2">무늬: <b>{t.suits === 'monotone' ? '모노톤' : t.suits === 'two-tone' ? '투톤' : '레인보우'}</b>{t.paired ? ' · 페어 보드' : ''}</div>
            <div className="bg-slate-800 rounded p-2">최고 카드 <b>{t.highRank}</b> · {t.connected}</div>
            <div className="bg-slate-800 rounded p-2">레인지 우위: <b>{t.rangeAdvantage === 'raiser' ? '프리플랍 레이저' : t.rangeAdvantage === 'caller' ? '콜러' : '중립'}</b></div>
          </div>
          <div className="bg-indigo-950/50 border border-indigo-800 rounded p-2 text-sm" data-testid="cbet-advice">C-벳 가이드: 팟의 <b>{Math.round(t.cbet.sizeFrac * 100)}%</b> 안팎, 빈도 <b>{Math.round(t.cbet.freq * 100)}%</b> 안팎<div className="text-xs text-slate-300">{t.cbet.why}</div></div>
          <div className="text-xs text-slate-300">{t.sprAdvice}</div>
          <div className="text-[11px] text-slate-500">경험칙 기반 가이드입니다 (솔버 결과 아님). 블러프/밸류/체크백/블러프 캐치 연습은 「맞춤 훈련」과 「트레이너」의 스팟 분석을 이용하세요.</div>
        </div>
      )}
    </div>
  );
}

// ───────── ICM 연구소 ─────────
function IcmLab() {
  const [stacks, setStacks] = useState('5200, 3800, 2600, 1500, 900');
  const [pays, setPays] = useState('50, 30, 20');
  const [hero, setHero] = useState(3); const [vill, setVill] = useState(0);
  const st = stacks.split(/[ ,]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const pa = pays.split(/[ ,]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const bad = st.length < 2 || st.length > 200 || !pa.length || pa.length > st.length;
  const res = useMemo(() => (bad ? null : icmLab(st, pa)), [stacks, pays]); // eslint-disable-line
  const h = Math.min(hero, st.length - 1), v = Math.min(vill, st.length - 1);
  const bf = useMemo(() => (bad || h === v ? null : bubbleFactor(st, pa, h, v)), [stacks, pays, hero, vill]); // eslint-disable-line
  const tot = st.reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-2" data-testid="lab-icm">
      <div className="flex items-center gap-2"><b>토너먼트 · ICM 연구소</b>{res && <RigorBadge r={res.mode === 'exact' ? 'exact' : 'sampled'} />}</div>
      <label className="text-xs block">스택 (쉼표로 구분)<input className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" value={stacks} onChange={(e) => setStacks(e.target.value)} data-testid="icm-stacks" /></label>
      <label className="text-xs block">상금 (순위순)<input className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" value={pays} onChange={(e) => setPays(e.target.value)} data-testid="icm-pays" /></label>
      {bad && <div className="text-rose-300 text-sm" data-testid="icm-error">스택은 2~200개, 상금은 1개 이상이며 스택 수 이하여야 합니다</div>}
      {res && (
        <>
          <table className="w-full text-xs" data-testid="icm-table"><thead><tr className="text-slate-400"><th className="text-left">#</th><th className="text-right">칩</th><th className="text-right">칩 비중</th><th className="text-right">ICM 가치</th><th className="text-right">ICM 비중</th></tr></thead>
            <tbody>{st.slice(0, 12).map((s, i) => <tr key={i} className={i === h ? 'text-sky-300' : i === v ? 'text-rose-300' : ''}><td>{i + 1}{i === h ? ' (나)' : i === v ? ' (상대)' : ''}</td><td className="text-right font-mono">{s.toLocaleString()}</td><td className="text-right">{((s / tot) * 100).toFixed(1)}%</td><td className="text-right font-mono">{res.equity[i].toFixed(2)}{res.se ? ` ±${(res.se[i] * 2).toFixed(2)}` : ''}</td><td className="text-right">{(res.pct[i] * 100).toFixed(1)}%</td></tr>)}</tbody></table>
          <div className="text-[11px] text-slate-500" data-testid="icm-note">{res.note}</div>
        </>
      )}
      <div className="grid grid-cols-2 gap-2"><label className="text-xs">나 (번호)<input type="number" min={1} max={Math.max(1, st.length)} value={hero + 1} onChange={(e) => setHero(Math.max(0, Number(e.target.value) - 1))} className="w-full rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" data-testid="icm-hero" /></label><label className="text-xs">상대 (번호)<input type="number" min={1} max={Math.max(1, st.length)} value={vill + 1} onChange={(e) => setVill(Math.max(0, Number(e.target.value) - 1))} className="w-full rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" data-testid="icm-villain" /></label></div>
      {bf && (
        <div className="bg-slate-800 rounded p-2 text-sm space-y-1" data-testid="icm-bubble">
          <div>올인 대결(유효 {bf.effective.toLocaleString()}칩) 손익분기 승률: <b className="text-yellow-300">{(bf.breakevenEquity * 100).toFixed(1)}%</b> (칩 EV 기준 {(bf.chipBreakeven * 100).toFixed(1)}%)</div>
          <div>리스크 프리미엄 <b>{(bf.riskPremium * 100).toFixed(1)}%p</b> · 버블 팩터 {bf.bubbleFactor.toFixed(2)} <span className="text-xs text-slate-400">(ICM 가치: 승 {bf.evWin.toFixed(2)} / 패 {bf.evLose.toFixed(2)} / 폴드 {bf.evFold.toFixed(2)})</span></div>
          <div className="text-[11px] text-slate-500">대규모 필드·PKO의 바운티·포지션 효과는 이 모델에 포함되지 않아 휴리스틱 보정이 필요합니다. 스택이 9명 이하일 때만 정확한 ICM입니다.</div>
        </div>
      )}
    </div>
  );
}

// ───────── 결정 풀 (최근 핸드의 결정 복기 결과) ─────────
interface PoolDec extends DecisionReview { recIdx: number }
function useDecisionPool(records: HandRecord[]) {
  const [pool, setPool] = useState<PoolDec[]>([]);
  const [progress, setProgress] = useState(0);
  const run = useRef(0);
  useEffect(() => {
    const my = ++run.current; setPool([]); setProgress(0);
    const take = records.slice(-60);
    const offset = records.length - take.length;
    (async () => {
      const acc: PoolDec[] = [];
      for (let i = 0; i < take.length; i++) {
        if (run.current !== my) return;
        try { reviewHand(take[i], 'hero', 160).decisions.forEach((d) => acc.push({ ...d, recIdx: offset + i })); } catch { /* 영웅이 없는 핸드 */ }
        if (i % 4 === 3) { setProgress((i + 1) / take.length); await new Promise((r) => setTimeout(r, 0)); }
      }
      if (run.current === my) { setPool(acc); setProgress(1); }
    })();
    return () => { run.current++; };
  }, [records.length]); // eslint-disable-line
  return { pool, progress };
}

// ───────── 약점 지도 ─────────
const STACK_BUCKETS: [string, (b: number) => boolean][] = [['≤15BB', (b) => b <= 15], ['15~30BB', (b) => b > 15 && b <= 30], ['30~60BB', (b) => b > 30 && b <= 60], ['60BB+', (b) => b > 60]];
export const topicOf = (d: DecisionReview): string => (d.street === 'preflop' ? (d.preflopRaisesFaced > 0 ? '프리플랍: 레이즈에 대응' : '프리플랍: 오픈/림프') : `${({ flop: '플랍', turn: '턴', river: '리버' } as Record<string, string>)[d.street] ?? d.street}: ${d.facingBet ? '베팅에 대응' : '주도/체크'}`);
function WeakMap({ pool, progress }: { pool: PoolDec[]; progress: number }) {
  const topics = [...new Set(pool.map(topicOf))].sort();
  const cell = (t: string, f: (b: number) => boolean) => { const ds = pool.filter((d) => topicOf(d) === t && f(d.stackBB)); return { n: ds.length, loss: ds.reduce((s, d) => s + d.evLossBB, 0), score: ds.filter((d) => d.score !== null).length ? ds.reduce((s, d) => s + (d.score ?? 0), 0) / ds.filter((d) => d.score !== null).length : null }; };
  const sizeB: [string, (d: DecisionReview) => boolean][] = [['작은 벳(<40%)', (d) => (d.facedFracOfPot ?? -1) >= 0 && (d.facedFracOfPot ?? 9) < 0.4], ['중간(40~80%)', (d) => (d.facedFracOfPot ?? -1) >= 0.4 && (d.facedFracOfPot ?? 9) < 0.8], ['큰 벳(80~120%)', (d) => (d.facedFracOfPot ?? -1) >= 0.8 && (d.facedFracOfPot ?? 9) < 1.2], ['오버벳(120%+)', (d) => (d.facedFracOfPot ?? -1) >= 1.2]];
  const top3 = topics.map((t) => ({ t, loss: pool.filter((d) => topicOf(d) === t).reduce((s, d) => s + d.evLossBB, 0), n: pool.filter((d) => topicOf(d) === t).length })).sort((a, b) => b.loss - a.loss).slice(0, 3);
  if (progress < 1) return <div className="text-sm text-slate-300" data-testid="weak-progress">결정을 하나씩 다시 계산하는 중… {Math.round(progress * 100)}%</div>;
  if (pool.length < 12) return <div className="text-sm text-slate-300" data-testid="weak-empty">결정 표본이 부족합니다 (현재 {pool.length}개, 최소 12개). 더 플레이한 뒤 확인하세요. 표본이 적을 때 약점을 단정하지 않습니다.</div>;
  return (
    <div className="space-y-3" data-testid="lab-weak">
      <div className="flex items-center gap-2"><b>내 약점 지도</b><RigorBadge r="sampled" /></div>
      <div className="text-xs text-slate-400">최근 {new Set(pool.map((d) => d.recIdx)).size}핸드 · 결정 {pool.length}개. 칸 = 결정 수(n) / 추정 EV 손실(BB). 표본 8개 미만 칸은 「–」로 두고 색을 칠하지 않습니다. 손실은 팟오즈·승률 추정에서 나온 <b>추정</b>입니다.</div>
      <div className="overflow-x-auto"><table className="w-full text-xs min-w-[420px]" data-testid="weak-table"><thead><tr className="text-slate-400"><th className="text-left">주제</th>{STACK_BUCKETS.map(([l]) => <th key={l} className="text-right">{l}</th>)}</tr></thead>
        <tbody>{topics.map((t) => <tr key={t}><td className="py-1 pr-2">{t}</td>{STACK_BUCKETS.map(([l, f]) => { const c = cell(t, f); const ok = c.n >= 8; return <td key={l} className="text-right"><span className={`inline-block min-w-[3.5rem] rounded px-1 ${ok ? (c.loss / c.n > 0.6 ? 'bg-rose-800' : c.loss / c.n > 0.25 ? 'bg-amber-800' : 'bg-emerald-900') : 'text-slate-600'}`}>{ok ? `${c.n} / ${c.loss.toFixed(1)}` : c.n ? `${c.n} / –` : '·'}</span></td>; })}</tr>)}</tbody></table></div>
      <div className="overflow-x-auto"><table className="w-full text-xs" data-testid="weak-size-table"><thead><tr className="text-slate-400"><th className="text-left">상대 베팅 크기에 대응</th><th className="text-right">결정</th><th className="text-right">추정 EV 손실</th><th className="text-right">판단 점수</th></tr></thead>
        <tbody>{sizeB.map(([l, f]) => { const ds = pool.filter((d) => d.facingBet && f(d)); const sc = ds.filter((d) => d.score !== null); return <tr key={l}><td className="py-1">{l}</td><td className="text-right">{ds.length}</td><td className="text-right font-mono">{ds.length >= 8 ? ds.reduce((s, d) => s + d.evLossBB, 0).toFixed(1) + 'BB' : '–'}</td><td className="text-right">{sc.length >= 8 ? (sc.reduce((s, d) => s + (d.score ?? 0), 0) / sc.length).toFixed(0) : '–'}</td></tr>; })}</tbody></table></div>
      <div data-testid="weak-top3"><div className="font-bold text-sm">개선 우선순위 Top 3 (추정 EV 손실 합 기준)</div><ol className="list-decimal pl-5 text-sm">{top3.map((x) => <li key={x.t}>{x.t} — 결정 {x.n}개, 추정 손실 {x.loss.toFixed(1)}BB{x.n < 12 ? ' (표본 부족)' : ''}</li>)}</ol></div>
      <div className="text-[11px] text-slate-500">상관관계는 인과가 아닙니다. 분산이 큰 포커에서는 표본이 커질수록 신뢰도가 올라갑니다. 정확한 솔버 EV 손실이 아닙니다.</div>
    </div>
  );
}

// ───────── 맞춤 훈련 ─────────
const LEAK_LABEL: Record<string, string> = { 'river-call': '리버 큰 벳 콜 판단', 'turn-call': '턴 베팅 대응', 'overbet-fold': '오버벳에 대한 폴드/콜', 'small-bet-fold': '작은 벳에 과도한 폴드', real: '내 실제 핸드 복습' };
type Ans = 'call' | 'fold';
function gradeQ(q: TrainQuestion, ans: Ans, seed: number) {
  const hole = q.hole.map(cardToString).join(' ');
  const bbv = 100;
  const spot: Spot = { id: q.id, hole, board: q.board.map(cardToString).join(' '), pos: q.pos, opponents: 1, stackBB: q.stackBB, potBB: q.pot / bbv, toCallBB: q.toCall / bbv, villainPct: q.villainPct };
  const r = solveSpot(spot, createRng(seed), 1500);
  const need = r.need ?? 0;
  const margin = 0.03;
  const ref: Ans | 'either' = r.equity > need + margin ? 'call' : r.equity < need - margin ? 'fold' : 'either';
  return { ok: ref === 'either' || ref === ans, ref, equity: r.equity, need, se: r.se };
}
function Training({ pool, records }: { pool: PoolDec[]; records: HandRecord[] }) {
  const [log, setLog] = useState<TrainingAttempt[]>([]);
  const [phase, setPhase] = useState<'idle' | 'pre' | 'learn' | 'post' | 'done'>('idle');
  const [leak, setLeak] = useState('river-call');
  const [qs, setQs] = useState<TrainQuestion[]>([]);
  const [i, setI] = useState(0);
  const [fb, setFb] = useState<ReturnType<typeof gradeQ> | null>(null);
  const [score, setScore] = useState({ c: 0, n: 0 });
  const [pre, setPre] = useState<number | null>(null);
  useEffect(() => { void loadKV<TrainingAttempt[]>('training').then((v) => v && setLog(v)); }, []);
  const leaks = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of pool) { if (d.evLossBB <= 0) continue; const k = d.street === 'river' ? 'river-call' : d.street === 'turn' ? 'turn-call' : (d.facedFracOfPot ?? 0) >= 0.9 ? 'overbet-fold' : 'small-bet-fold'; m.set(k, (m.get(k) ?? 0) + d.evLossBB); }
    const arr = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    for (const k of ['river-call', 'turn-call', 'overbet-fold']) if (!arr.includes(k)) arr.push(k);
    return arr.slice(0, 3);
  }, [pool]);
  const build = (phaseSeed: number, avoid: Set<string>): TrainQuestion[] => {
    const rng = createRng(phaseSeed);
    const real = realSpotsFrom(records, 'hero', 40).filter((q) => !avoid.has(q.id));
    const out: TrainQuestion[] = [];
    // 절반은 내 실제 핸드(결정 시점 정보만), 나머지는 독립적으로 생성한 유사 문제
    for (let k = 0; k < Math.min(Math.floor(TRAINING_RULES.questionsPerSet / 2), real.length); k++) out.push(real.splice(rng.int(real.length), 1)[0]);
    let idx = 0; while (out.length < TRAINING_RULES.questionsPerSet) out.push(makeSpotQuestion(rng, leak, phaseSeed + idx++));
    return out;
  };
  const start = () => { const set = build(randomSeed(), new Set()); setQs(set); setI(0); setFb(null); setScore({ c: 0, n: 0 }); setPhase('pre'); setPre(null); };
  const answer = (a: Ans) => {
    const q = qs[i]; if (!q || fb) return;
    const g = gradeQ(q, a, randomSeed());
    setFb(g); setScore((s) => ({ c: s.c + (g.ok ? 1 : 0), n: s.n + 1 }));
  };
  const next = () => {
    setFb(null);
    if (i + 1 < qs.length) { setI(i + 1); return; }
    if (phase === 'pre') { setPre(score.c / score.n); setPhase('learn'); return; }
    const post = score.c / score.n;
    const att: TrainingAttempt = { id: `${Date.now()}`, leak, at: Date.now(), pre, post, n: score.n, reviewDue: Date.now() + TRAINING_RULES.reviewAfterDays * 86400000, handsAtTraining: records.length };
    const nl = [...log, att]; setLog(nl); void saveKV('training', nl); setPhase('done');
  };
  const startPost = () => { const used = new Set(qs.map((q) => q.id)); const set = build(randomSeed() ^ 0x5bd1e995, used).filter((q) => !used.has(q.id)); setQs(set); setI(0); setFb(null); setScore({ c: 0, n: 0 }); setPhase('post'); };
  const q = qs[i];
  const due = log.filter((a) => a.post !== null && Date.now() >= a.reviewDue);
  return (
    <div className="space-y-3" data-testid="lab-train">
      <div className="flex items-center gap-2"><b>맞춤 훈련</b><RigorBadge r="sampled" /></div>
      <div className="text-xs text-slate-400">절차: 사전 테스트({TRAINING_RULES.questionsPerSet}문항) → 해설 → <b>독립된 새 문항</b>으로 사후 테스트 → {TRAINING_RULES.reviewAfterDays}일 뒤 복습 → 실전 변화 확인. 문제는 내 실제 핸드의 <b>결정 시점 정보만</b> + 생성한 유사 문제로 구성되며 결과를 외워 맞히는 구조가 아닙니다. 향상 기준: 정답률 +{TRAINING_RULES.improvementThreshold * 100}%p 이상, 문항 {TRAINING_RULES.minSamplePerSet}개 이상.</div>
      {phase === 'idle' && (
        <div className="space-y-2">
          <div className="text-sm">자주 틀린 주제 Top 3 (추정 EV 손실 기준{pool.length < 12 ? ' · 표본 부족: 기본 주제 제시' : ''}):</div>
          <div className="flex gap-2 flex-wrap">{leaks.map((k) => <button key={k} className={`btn !min-h-[38px] text-sm ${leak === k ? 'bg-indigo-600' : 'bg-slate-700'}`} onClick={() => setLeak(k)} data-testid={`train-leak-${k}`}>{LEAK_LABEL[k] ?? k}</button>)}</div>
          <button className="btn w-full bg-emerald-700" onClick={start} data-testid="train-start">「{LEAK_LABEL[leak]}」 사전 테스트 시작</button>
        </div>
      )}
      {(phase === 'pre' || phase === 'post') && q && (
        <div className="rounded-xl bg-slate-900 border border-slate-700 p-3 space-y-2" data-testid="train-question">
          <div className="text-xs text-slate-400">{phase === 'pre' ? '사전 테스트' : '사후 테스트 (새 문항)'} {i + 1}/{qs.length} · {q.source === 'real-spot' ? '내 실제 핸드(결정 시점 정보만)' : '생성 문제'}</div>
          <div className="font-semibold">{q.title}</div>
          <div className="flex gap-1 items-center">{q.hole.map((c) => <CardView key={c} card={c} size="lg" />)}<span className="mx-1 text-slate-500">|</span>{q.board.map((c) => <CardView key={c} card={c} />)}</div>
          <div className="text-sm">팟 {q.pot} · 콜 {q.toCall} · 유효 스택 {q.stackBB}BB · 포지션 {q.pos} (상대 레인지는 상위 {Math.round(q.villainPct * 100)}%로 가정)</div>
          {!fb ? <div className="flex gap-2"><button className="btn flex-1 bg-sky-700" onClick={() => answer('call')} data-testid="train-call">콜</button><button className="btn flex-1 bg-rose-700" onClick={() => answer('fold')} data-testid="train-fold">폴드</button></div> : (
            <div className="text-sm space-y-1" data-testid="train-feedback">
              <b className={fb.ok ? 'text-emerald-300' : 'text-rose-300'}>{fb.ok ? (fb.ref === 'either' ? '경계선 — 어느 쪽도 정답으로 인정' : '정답') : '오답'}</b>
              <div>승률 {(fb.equity * 100).toFixed(1)}% ±{(fb.se * 200).toFixed(1)}%p (몬테카를로) vs 필요 승률 {(fb.need * 100).toFixed(1)}% (정확한 팟오즈) → 권장 {fb.ref === 'either' ? '콜/폴드 모두 가능' : fb.ref === 'call' ? '콜' : '폴드'}</div>
              <button className="btn !min-h-[38px] bg-slate-700" onClick={next} data-testid="train-next">{i + 1 < qs.length ? '다음 문제' : '결과 보기'}</button>
            </div>
          )}
        </div>
      )}
      {phase === 'learn' && <div className="rounded-xl bg-indigo-950/50 border border-indigo-800 p-3 space-y-2" data-testid="train-learn"><div>사전 점수 <b>{pre !== null ? Math.round(pre * 100) : 0}%</b> ({score.c}/{score.n})</div><div className="text-sm text-slate-200">교정 포인트: 콜 여부는 <b>필요 승률 = 콜액/(팟+콜액)</b> 과 내 승률 추정을 비교합니다. 상대 베팅이 클수록 필요 승률이 올라가고, 상대 레인지가 강해질수록 내 승률이 내려갑니다. 두 값이 가까우면 포지션·임플라이드 오즈를 고려하세요.</div><button className="btn w-full bg-emerald-700" onClick={startPost} data-testid="train-post-start">사후 테스트 시작 (새 문항)</button></div>}
      {phase === 'done' && (() => { const a = log[log.length - 1]; return <div className="rounded-xl bg-slate-900 border border-slate-700 p-3 space-y-2" data-testid="train-done"><div>사전 {Math.round((a.pre ?? 0) * 100)}% → 사후 {Math.round((a.post ?? 0) * 100)}% ({a.n}문항)</div><div className="text-sm" data-testid="train-verdict">{verdictOfTraining(a)}</div><div className="text-xs text-slate-400">7일 후 복습 예정: {new Date(a.reviewDue).toLocaleDateString()} · 정답률 향상은 학습 효과의 간접 지표일 뿐, 실력 향상은 이후 실전 핸드의 같은 상황 지표로 확인합니다.</div><button className="btn !min-h-[38px] bg-slate-700" onClick={() => setPhase('idle')}>다른 주제 훈련</button></div>; })()}
      {due.length > 0 && <div className="p-2 rounded bg-amber-900/50 text-sm" data-testid="train-review-due">7일 복습 시점이 된 훈련이 {due.length}개 있습니다. 같은 주제로 다시 테스트해 보세요.</div>}
      {log.length > 0 && <div data-testid="train-log"><div className="font-bold text-sm">훈련 기록</div>{[...log].reverse().slice(0, 6).map((a) => <div key={a.id} className="text-xs text-slate-300 flex justify-between"><span>{new Date(a.at).toLocaleDateString()} · {LEAK_LABEL[a.leak] ?? a.leak}</span><span>{a.pre === null ? '–' : Math.round(a.pre * 100)}% → {a.post === null ? '–' : Math.round(a.post * 100)}% ({a.n}) · 실전 {records.length - a.handsAtTraining}핸드 경과{records.length - a.handsAtTraining < TRAINING_RULES.minInGameDecisions ? ' (판정하기엔 표본 부족)' : ''}</span></div>)}</div>}
    </div>
  );
}

// ───────── 상대 데이터 ─────────
function Opponents() {
  const { memory } = useGame();
  const rows = Object.entries(memory).filter(([id, st]) => id !== 'hero' && st.hands > 0).sort((a, b) => b[1].hands - a[1].hands).slice(0, 40);
  return (
    <div className="space-y-2" data-testid="lab-opp">
      <div className="flex items-center gap-2"><b>상대별 데이터</b><RigorBadge r="sampled" /></div>
      <div className="text-xs text-slate-400">공개된 행동과 쇼다운으로만 기록됩니다. 상대의 숨은 카드·버린 카드·덱 순서는 알 수 없고 사용하지 않습니다. 표본이 작으면 「표본 부족」입니다.</div>
      {rows.length === 0 && <div className="text-sm text-slate-300" data-testid="opp-empty">아직 관찰 기록이 없습니다.</div>}
      {rows.map(([id, st]) => {
        const w = playerById(id); const r = rosterById(id);
        const n = st.hands;
        return (
          <div key={id} className="rounded-lg bg-slate-800/70 p-2 text-sm" data-testid="opp-row">
            <div className="flex justify-between"><b>{w?.name ?? r?.name ?? id}</b><span className="text-xs text-slate-400">관찰 {n}핸드 · 신뢰도 {n >= 100 ? '높음' : n >= 30 ? '보통' : '표본 부족'}</span></div>
            {n >= 10 ? <div className="text-xs text-slate-300">VPIP {(estimate.vpip(st) * 100).toFixed(0)}% · PFR {(estimate.pfr(st) * 100).toFixed(0)}% (스무딩 추정)</div> : <div className="text-xs text-slate-500">10핸드 미만 — 수치를 표시하지 않습니다</div>}
            {w && <div className="text-[11px] text-slate-400">{w.kind === 'real_legacy' ? '공개 기록 기반의 게임적 해석(실제 통계 아님)' : '2035 가상 인물'} · 약점 가설: {w.counterplay || '—'}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ───────── 경제·상금 감사 ─────────
function Audit() {
  const { wallet, tourneys } = useGame();
  const errs = verifyWallet(wallet);
  const sm = summarize(wallet);
  const closed = Object.values(wallet.accounts).filter((a) => a.kind === 'tournament' && a.status === 'closed');
  const sumPrizeTx = wallet.txs.filter((t) => t.kind === 'tourney-prize' || t.kind === 'bounty-prize').reduce((a, t) => a + t.amount, 0);
  const sumAcct = closed.reduce((a, x) => a + x.returned, 0);
  const sumRecords = tourneys.reduce((a, t) => a + t.prize, 0);
  const rows = [
    ['원장 상금 합계(거래)', sumPrizeTx], ['경기 계정 returned 합계', sumAcct], ['대회 전적 기록 상금 합계', sumRecords],
  ] as const;
  const consistent = sumPrizeTx === sumAcct && (tourneys.length === 0 || sumAcct === sumRecords);
  return (
    <div className="space-y-2" data-testid="lab-audit">
      <div className="flex items-center gap-2"><b>경제·상금 감사</b><RigorBadge r="exact" /></div>
      <div className={`p-2 rounded text-sm ${errs.length ? 'bg-rose-900/60' : 'bg-emerald-900/40'}`} data-testid="audit-ledger">{errs.length ? `원장 검산 실패: ${errs.slice(0, 3).join(' / ')} — 분석 통계에서 제외합니다` : '원장 검산 통과 (초기+Σ거래=잔액, id 중복 없음, 계정별 지출/수입 일치)'}</div>
      <table className="w-full text-xs"><tbody>{rows.map(([l, v]) => <tr key={l}><td className="py-1">{l}</td><td className="text-right font-mono">{v.toLocaleString()}</td></tr>)}</tbody></table>
      <div className={`p-2 rounded text-sm ${consistent ? 'bg-emerald-900/40' : 'bg-amber-900/50'}`} data-testid="audit-stats">{consistent ? '분석 통계(전적·ROI)가 원장과 일치합니다.' : '전적 기록과 원장이 일치하지 않습니다 — 불일치 구간은 legacy/unverified 로 보고 ROI 집계에서 검토 표시합니다 (조용히 보정하지 않음).'}</div>
      <div className="text-xs text-slate-400">대회 {sm.tourneys}회 · ITM {sm.itm} · 우승 {sm.wins} · ROI {sm.roi === null ? '–' : `${(sm.roi * 100).toFixed(0)}%`} (분모: 참가비+수수료+재진입)</div>
    </div>
  );
}

// ───────── 리플레이 ─────────
function ReplayTab() {
  const { setScreen } = useGame();
  return (
    <div className="space-y-2" data-testid="lab-replay">
      <b>핸드 리플레이 · 결정 지점 복기</b>
      <div className="text-sm text-slate-300">프리플랍→리버 타임라인, 포지션, 스택(BB), 팟/사이드팟, 실제 베팅 크기는 「핸드 기록」의 리플레이에서 단계별로 확인합니다. 각 결정에서 <b>그때 알 수 있던 정보</b>, 팟오즈(정확)와 필요 승률, 승률 추정의 오차, 대안 행동을 보여 줍니다. 승리한 핸드를 무조건 잘했다고, 진 핸드를 무조건 잘못했다고 평가하지 않습니다.</div>
      <div className="text-sm text-amber-200">공개되지 않은 상대 카드는 복기에서도 「알 수 없음」입니다 — 쇼다운에서 공개된 카드만 보입니다.</div>
      <button className="btn w-full bg-sky-700" onClick={() => setScreen('history')} data-testid="lab-open-history">핸드 기록 열기 (리플레이 · 복기)</button>
    </div>
  );
}

export function LabScreen() {
  const { recordsFor, setScreen, session } = useGame();
  const [tab, setTab] = useState<Tab>('report');
  const records = recordsFor('competitive');
  const needsPool = tab === 'weak' || tab === 'train';
  const { pool, progress } = useDecisionPool(needsPool ? records : []);
  return (
    <div className="max-w-2xl mx-auto p-3 space-y-3 overflow-y-auto h-full safe-pad" data-testid="lab">
      <div className="flex items-center gap-2"><button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen(session ? 'table' : 'menu')} data-testid="coach-back">← 뒤로</button><h1 className="text-xl font-bold">고급 분석실</h1></div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" data-testid="lab-tabs">{TABS.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={`btn !min-h-[36px] !py-1 text-xs whitespace-nowrap ${tab === t ? 'bg-indigo-600' : 'bg-slate-700'}`} onClick={() => setTab(t)} data-testid={`lab-tab-${t}`}>{l}</button>)}</div>
      {tab === 'report' && <CoachScreen embedded />}
      {tab === 'replay' && <ReplayTab />}
      {tab === 'preflop' && <PreflopLab />}
      {tab === 'postflop' && <PostflopLab />}
      {tab === 'icm' && <IcmLab />}
      {tab === 'weak' && <WeakMap pool={pool} progress={records.length ? progress : 1} />}
      {tab === 'train' && <Training pool={pool} records={records} />}
      {tab === 'opp' && <Opponents />}
      {tab === 'audit' && <Audit />}
      <div className="text-[11px] text-slate-500 pb-8">수치 표기: <RigorBadge r="exact" /> 정확한 계산 · <RigorBadge r="sampled" /> 몬테카를로(시드·반복·오차) · <RigorBadge r="heuristic" /> 경험칙. 이 분석실은 솔버가 아니며 「GTO 확정값」「솔버 정확도」를 주장하지 않습니다. 유료 솔버/API 의존성 없음.</div>
    </div>
  );
}
void payoutStructure;
