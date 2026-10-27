import { useEffect, useState } from 'react';
import { Session } from '../game/session';
import { useGame } from '../store/useGame';

/** 캐시게임: 핸드 사이에 통장에서 칩을 더 가져온다 (탑업/리바이). 테이블 최대 바이인을 넘을 수 없다. */
export function RebuyPanel({ sess }: { sess: Session }) {
  const { wallet, doRebuy, notice } = useGame();
  const cash = sess.config.cash!;
  const hero = sess.game.players.find((p) => p.isHuman)!;
  const practice = cash.tableId === 'practice';
  const room = cash.max - hero.stack;
  const afford = practice ? room : Math.min(room, wallet.balance);
  const base = sess.config.buyInChips ?? cash.min;
  const def = Math.max(0, Math.min(afford, hero.stack === 0 ? base : room));
  const [amount, setAmount] = useState(def);
  useEffect(() => { setAmount(def); }, [def, sess.game.handNo]);
  const busted = hero.stack === 0;
  const bb = sess.config.bb;
  const can = amount > 0 && amount <= afford && hero.stack + amount <= cash.max && (busted ? amount >= cash.min || amount >= bb * 10 : true);
  return (
    <div className={`rounded-lg border p-2 text-sm space-y-1 ${busted ? 'border-amber-500 bg-amber-950/40' : 'border-slate-700 bg-slate-900/60'}`} data-testid="rebuy-panel">
      <div className="flex justify-between text-xs text-slate-300"><span>테이블 칩 {hero.stack.toLocaleString()} (최대 {cash.max.toLocaleString()})</span>{!practice && <span>통장 {wallet.balance.toLocaleString()}</span>}</div>
      {busted && <div className="text-amber-200 text-xs">칩이 모두 사라졌습니다. 추가 바이인으로 이어가거나 나가세요.</div>}
      {room > 0 && afford > 0 ? (
        <div className="flex gap-2 items-center">
          <input className="w-28 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-right font-mono" inputMode="numeric" value={amount} onChange={(e) => setAmount(Math.max(0, Math.min(afford, Number(e.target.value.replace(/\D/g, '')) || 0)))} aria-label="추가 바이인 금액" data-testid="rebuy-amount" />
          <button className="btn !min-h-[38px] !py-1 bg-amber-600 text-black text-sm" disabled={!can} onClick={() => doRebuy(amount)} data-testid={busted ? 'btn-rebuy' : 'btn-topup'}>{busted ? '리바이' : '탑업'}</button>
          <button className="btn !min-h-[38px] !py-1 bg-slate-700 text-xs" onClick={() => setAmount(afford)}>최대</button>
        </div>
      ) : (
        <div className="text-xs text-slate-400">{room <= 0 ? '이미 최대 바이인입니다.' : '통장 잔액이 부족합니다.'}</div>
      )}
      {notice && <div className="text-rose-300 text-xs">{notice}</div>}
    </div>
  );
}
