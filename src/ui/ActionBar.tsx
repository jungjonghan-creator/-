import { useEffect, useMemo, useState } from 'react';
import { legalActions } from '../engine/game';
import { Session } from '../game/session';
import { decisionToken, useGame } from '../store/useGame';

export function ActionBar({ sess }: { sess: Session }) {
  const { act, busy } = useGame();
  const g = sess.game;
  const la = useMemo(() => (g.toAct !== null && g.players[g.toAct].isHuman ? legalActions(g) : null), [g]);
  const token = decisionToken(sess);
  const [amount, setAmount] = useState(0);
  const [confirmAllIn, setConfirmAllIn] = useState(false);
  const hero = g.players.find((p) => p.isHuman)!;

  useEffect(() => { if (la) setAmount(la.minTo); setConfirmAllIn(false); }, [token]); // eslint-disable-line

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!la || busy || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'f') la.canFold && act({ type: 'fold' }, token);
      if (e.key === 'c') la.canCheck ? act({ type: 'check' }, token) : la.canCall && act({ type: 'call' }, token);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [la, busy, token, act]);

  if (!la) {
    return <div className="h-[104px] sm:h-[120px] flex items-center justify-center text-slate-400 text-sm" data-testid="waiting">{busy ? '상대 행동 중…' : g.street === 'complete' ? '' : '대기 중'}</div>;
  }
  const pot = la.pot;
  const clampTo = (v: number) => Math.max(la.minTo, Math.min(la.maxTo, Math.round(v) || la.minTo));
  const presets: [string, number][] = [['⅓', 1 / 3], ['½', 1 / 2], ['¾', 3 / 4], ['팟', 1]];
  const presetTo = (f: number) => clampTo(g.currentBet + f * (pot + la.callAmount));
  const extra = Math.max(0, amount - hero.bet);
  const isAllIn = amount >= la.maxTo;
  const disabled = busy;

  return (
    <div className="px-2 pb-2 pt-1 space-y-1.5 safe-pad" data-testid="actionbar">
      {la.canRaise && (
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            {presets.map(([l, f]) => (
              <button key={l} className="btn !min-h-[34px] !py-0 !px-2.5 bg-slate-700 hover:bg-slate-600 text-sm" disabled={disabled} onClick={() => setAmount(presetTo(f))} data-testid={`preset-${l}`}>{l}</button>
            ))}
            <button className="btn !min-h-[34px] !py-0 !px-2.5 bg-slate-700 text-sm" disabled={disabled} onClick={() => setAmount(la.minTo)} data-testid="preset-min">최소</button>
            <input inputMode="numeric" className="ml-auto w-24 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-right font-mono" value={amount} disabled={disabled}
              onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)} onBlur={() => setAmount(clampTo(amount))} data-testid="amount-input" aria-label="총 베팅액" />
          </div>
          <div className="flex items-center gap-2">
            <input type="range" className="flex-1 min-w-0 h-6" min={la.minTo} max={la.maxTo} value={amount} disabled={disabled} onChange={(e) => setAmount(clampTo(Number(e.target.value)))} data-testid="slider" aria-label="베팅 금액 슬라이더" />
            <div className="text-[11px] text-slate-300 shrink-0 text-right" data-testid="amount-info">총 {amount.toLocaleString()} (이번 추가 {extra.toLocaleString()}) · 팟 {pot.toLocaleString()}</div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-4 gap-1.5 [&>button]:!min-h-[46px] [&>button]:!px-1 [&>button]:text-sm sm:[&>button]:!min-h-[48px]">
        <button className="btn bg-rose-700 hover:bg-rose-600" disabled={disabled || !la.canFold} onClick={() => act({ type: 'fold' }, token)} data-testid="btn-fold">폴드</button>
        {la.canCheck
          ? <button className="btn bg-sky-700 hover:bg-sky-600" disabled={disabled} onClick={() => act({ type: 'check' }, token)} data-testid="btn-check">체크</button>
          : <button className="btn bg-sky-700 hover:bg-sky-600" disabled={disabled || !la.canCall} onClick={() => act({ type: 'call' }, token)} data-testid="btn-call">콜 {la.callAmount.toLocaleString()}</button>}
        <button className="btn bg-emerald-700 hover:bg-emerald-600" disabled={disabled || !la.canRaise}
          onClick={() => (isAllIn ? setConfirmAllIn(true) : act({ type: la.isBet ? 'bet' : 'raise', to: clampTo(amount) }, token))} data-testid="btn-raise">
          {la.isBet ? '베팅' : '레이즈'} {la.canRaise ? clampTo(amount).toLocaleString() : ''}
        </button>
        <button className="btn bg-amber-600 hover:bg-amber-500 text-black" disabled={disabled || (!la.canRaise && !la.canCall)} onClick={() => setConfirmAllIn(true)} data-testid="btn-allin">올인</button>
      </div>
      {confirmAllIn && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-testid="allin-confirm">
          <div className="bg-slate-900 border border-amber-500 rounded-2xl p-5 max-w-sm w-full text-center space-y-4">
            <div className="text-lg font-bold text-amber-300">올인 하시겠습니까?</div>
            <div className="text-sm text-slate-300">{la.canRaise ? `남은 칩 ${hero.stack.toLocaleString()} 전부 투입 (총 ${la.maxTo.toLocaleString()})` : `콜 올인 ${la.callAmount.toLocaleString()}`}</div>
            <div className="flex gap-2">
              <button className="btn flex-1 bg-slate-700" onClick={() => setConfirmAllIn(false)} data-testid="allin-cancel">취소</button>
              <button className="btn flex-1 bg-amber-600 text-black" onClick={() => { setConfirmAllIn(false); act({ type: 'allin' }, token); }} data-testid="allin-ok">올인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
