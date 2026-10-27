import { useGame } from '../store/useGame';
import { summarize, atTable } from '../economy/wallet';
import { cashTableById, tournamentById } from '../economy/catalog';

const fmt = (n: number) => Math.round(n).toLocaleString();

export function Menu() {
  const { wallet, walletErrors, resetWallet, saved, resume, hasSave, setScreen, corrupt, dismissCorrupt, ready, tourneys } = useGame();
  const sm = summarize(wallet);
  const at = atTable(wallet);
  const recent = Object.values(wallet.accounts).filter((a) => a.kind !== 'practice' && a.status === 'closed').sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)).slice(0, 3);
  const savedLabel = saved ? (saved.config.cash ? `${cashTableById(saved.config.cash.tableId).name} · 테이블 칩 ${fmt(saved.game.players[0].stack)}` : saved.tierId ? tournamentById(saved.tierId)?.name ?? '토너먼트' : '연습 경기') : '';
  return (
    <div className="max-w-xl mx-auto p-4 space-y-4 safe-pad overflow-y-auto h-full" data-testid="menu">
      <div>
        <h1 className="text-3xl font-extrabold tracking-wide">♠ POKER ARENA <span className="text-sky-400">5.0</span></h1>
        <p className="text-xs text-slate-400">가상 크레딧 기반 개인용 포커 시뮬레이터 — 실제 돈·결제·환전 없음.</p>
      </div>
      {walletErrors && (
        <div className="p-3 rounded-lg bg-rose-900/60 text-sm space-y-1" data-testid="wallet-corrupt">
          <b>통장 데이터에 문제가 있어 경기를 시작할 수 없습니다.</b>
          <ul className="list-disc pl-5 text-xs">{walletErrors.slice(0, 4).map((e, i) => <li key={i}>{e}</li>)}</ul>
          <button className="btn !min-h-[34px] bg-rose-700 text-xs" onClick={() => resetWallet()}>통장 초기화 (30,000 크레딧)</button>
        </div>
      )}
      {corrupt && (
        <div className="p-3 rounded-lg bg-rose-900/60 text-sm space-y-1" data-testid="corrupt">
          <b>저장된 경기 데이터가 손상되어 불러올 수 없습니다.</b>
          <ul className="list-disc pl-5 text-xs">{corrupt.errors.slice(0, 4).map((e, i) => <li key={i}>{e}</li>)}</ul>
          <div className="text-xs text-slate-300">삭제하면 그 경기에 묶여 있던 바이인/참가비는 통장으로 환불됩니다.</div>
          <button className="btn !min-h-[34px] bg-rose-700 text-xs" onClick={() => dismissCorrupt()} data-testid="btn-dismiss-corrupt">손상된 경기 삭제 + 환불</button>
        </div>
      )}
      <button className="w-full text-left rounded-xl p-4 bg-gradient-to-r from-slate-900 to-slate-800 border border-yellow-600/50" onClick={() => setScreen('wallet')} data-testid="nav-wallet">
        <div className="text-xs text-slate-400">내 통장 (가상 크레딧)</div>
        <div className="text-3xl font-extrabold text-yellow-300" data-testid="home-balance">{ready ? fmt(wallet.balance) : '…'}</div>
        <div className="text-xs text-slate-300 mt-1">테이블/대회 진행 중 {fmt(at)} · 누적 손익 <b className={sm.totalNet >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{sm.totalNet >= 0 ? '+' : ''}{fmt(sm.totalNet)}</b> · 최고 {fmt(sm.peak)}</div>
      </button>
      {hasSave && (
        <button className="btn w-full bg-emerald-600 !min-h-[56px]" onClick={() => resume()} data-testid="btn-resume">▶ 이어하기 — {savedLabel}</button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn bg-gradient-to-r from-sky-700 to-sky-600 !min-h-[64px] text-lg" onClick={() => setScreen('lobby')} data-testid="nav-lobby">캐시게임 · 토너먼트<div className="text-xs font-normal opacity-80">로비 입장</div></button>
        <button className="btn bg-gradient-to-r from-indigo-700 to-indigo-600 !min-h-[64px] text-lg" onClick={() => setScreen('coach')} data-testid="nav-coach">분석실<div className="text-xs font-normal opacity-80">내 플레이 분석</div></button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button className="btn bg-slate-800 text-sm" onClick={() => setScreen('stats')} data-testid="nav-stats">통계</button>
        <button className="btn bg-slate-800 text-sm" onClick={() => setScreen('history')} data-testid="nav-history">핸드 기록</button>
        <button className="btn bg-slate-800 text-sm" onClick={() => setScreen('trainer')} data-testid="nav-trainer">푸시/폴드·스팟 훈련</button>
        <button className="btn bg-slate-800 text-sm" onClick={() => setScreen('practice')} data-testid="nav-practice">연습 경기(통장 무관)</button>
      </div>
      {recent.length > 0 && (
        <section className="space-y-1" data-testid="recent">
          <h2 className="font-bold text-sm">최근 경기 결과</h2>
          {recent.map((a) => { const net = a.returned - a.spent; return <div key={a.id} className="flex justify-between text-xs bg-slate-800/70 rounded px-2 py-1"><span>{a.label}{a.place ? ` · ${a.place}위/${a.fieldSize}명` : ''}</span><span className={`font-mono ${net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{net >= 0 ? '+' : ''}{fmt(net)}</span></div>; })}
        </section>
      )}
      <div className="text-[11px] text-slate-500">전적: 토너먼트 {tourneys.length}회 · 입상 {tourneys.filter((t) => t.prize > 0).length}회</div>
    </div>
  );
}
