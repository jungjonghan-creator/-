import { atTable, summarize, TxKind } from '../economy/wallet';
import { useGame } from '../store/useGame';

const fmt = (n: number) => Math.round(n).toLocaleString();
const KIND: Record<TxKind, string> = {
  initial: '초기 지급', 'cash-buyin': '캐시 바이인', 'cash-topup': '캐시 추가 바이인', 'cash-cashout': '캐시 정산', 'tourney-entry': '토너먼트 참가비', 'tourney-fee': '토너먼트 수수료',
  'tourney-reentry': '토너먼트 재진입', 'tourney-prize': '토너먼트 상금', 'freeroll-prize': '프리롤 상금', adjust: '조정/환불',
};

export function WalletScreen() {
  const { wallet, setScreen } = useGame();
  const s = summarize(wallet);
  const accounts = Object.values(wallet.accounts).filter((a) => a.kind !== 'practice').sort((a, b) => b.openedAt - a.openedAt);
  const txs = [...wallet.txs].reverse().filter((t) => t.kind !== 'initial' || true).slice(0, 80);
  const card = (label: string, value: string, cls = '') => <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">{label}</div><div className={`text-lg font-bold ${cls}`}>{value}</div></div>;
  return (
    <div className="max-w-2xl mx-auto p-3 space-y-3 overflow-y-auto h-full safe-pad" data-testid="wallet">
      <div className="flex items-center gap-2"><button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="wallet-back">← 뒤로</button><h1 className="text-xl font-bold">통장</h1></div>
      <div className="grid grid-cols-2 gap-2 text-center">
        {card('보유 크레딧', fmt(wallet.balance), 'text-yellow-300')}
        {card('진행 중(테이블/대회)', fmt(atTable(wallet)))}
        {card('누적 손익', `${s.totalNet >= 0 ? '+' : ''}${fmt(s.totalNet)}`, s.totalNet >= 0 ? 'text-emerald-300' : 'text-rose-300')}
        {card('최대 보유 자산', fmt(s.peak))}
        {card(`캐시게임 손익 (${s.cashSessions}회)`, `${s.cashNet >= 0 ? '+' : ''}${fmt(s.cashNet)}`, s.cashNet >= 0 ? 'text-emerald-300' : 'text-rose-300')}
        {card(`토너먼트 손익 (${s.tourneys}회)`, `${s.tourneyNet >= 0 ? '+' : ''}${fmt(s.tourneyNet)}`, s.tourneyNet >= 0 ? 'text-emerald-300' : 'text-rose-300')}
      </div>
      <div className="text-xs text-slate-400" data-testid="wallet-totals">누적 캐시 바이인 {fmt(s.cashBuyIns)} · 누적 수수료 {fmt(s.feesPaid || 0)} · 전체 수익률 {s.overallRoi === null ? '-' : `${(s.overallRoi * 100).toFixed(1)}%`}</div>
      <div className="text-sm text-slate-300" data-testid="wallet-roi">토너먼트: 참가비·수수료 합계 {fmt(s.tourneyCost)} / 상금 합계 {fmt(s.tourneyPrizes)} · ROI {s.roi === null ? '-' : `${(s.roi * 100).toFixed(0)}%`} · 입상 {s.itm}/{s.tourneys} · 우승 {s.wins}회 <span className="text-slate-500">(표본 {s.tourneys}회)</span></div>
      <section className="space-y-1">
        <h2 className="font-bold text-sm">경기별 결산</h2>
        {accounts.length === 0 && <div className="text-xs text-slate-500">아직 경기가 없습니다.</div>}
        {accounts.slice(0, 20).map((a) => {
          const net = a.returned - a.spent;
          return <div key={a.id} className="flex justify-between text-xs bg-slate-800/70 rounded px-2 py-1"><span>{a.label}{a.place ? ` · ${a.place}위/${a.fieldSize}명` : ''}{a.status === 'open' ? ' · 진행 중' : ''}</span><span className={`font-mono ${a.status === 'open' ? 'text-slate-400' : net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{a.status === 'open' ? `−${fmt(a.spent)} 투입` : `${net >= 0 ? '+' : ''}${fmt(net)}`}</span></div>;
        })}
      </section>
      <section className="space-y-1" data-testid="ledger">
        <h2 className="font-bold text-sm">입출금 내역 (원장)</h2>
        {txs.map((t) => (
          <div key={t.id} className="flex justify-between text-xs border-b border-slate-800 py-1" data-testid="ledger-row">
            <span className="min-w-0"><span className="text-slate-400">{new Date(t.ts).toLocaleString()}</span> · {KIND[t.kind]} <span className="text-slate-500 truncate">{t.note}</span></span>
            <span className="font-mono shrink-0 text-right"><span className={t.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{t.amount >= 0 ? '+' : ''}{fmt(t.amount)}</span> <span className="text-slate-500">→ {fmt(t.balanceAfter)}</span></span>
          </div>
        ))}
      </section>
      <p className="text-[11px] text-slate-500 pb-6">모든 금액은 게임 내 가상 크레딧입니다. 현금·결제·환전과 연동되지 않습니다. 이 기기 브라우저에만 저장됩니다(통장 데이터 버전 {wallet.version}).</p>
    </div>
  );
}
