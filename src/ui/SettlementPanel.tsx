import { useGame } from '../store/useGame';
import type { Session } from '../game/session';
import { tournamentResult } from '../economy/actions';

const fmt = (n: number) => Math.round(n).toLocaleString();

/** 정산 상태 표시: 서버/원장이 확정한 값만 "지급 완료"로 보여 준다. 실패는 지급 완료가 아니며 재시도할 수 있다. */
export function SettlementPanel({ sess }: { sess: Session }) {
  const { settlement, settling, settleError, finalizeTourney, setScreen, online } = useGame();
  const r = tournamentResult(sess);
  const acct = useGame((g) => (sess.sid ? g.wallet.accounts[sess.sid] : undefined));
  if (!r) return null;
  if (!acct || acct.kind === 'practice') return <div className="p-3 rounded-lg bg-slate-800 text-sm" data-testid="settle-practice">연습 경기 — {r.place}위. 통장과 무관하므로 정산·랭킹 점수가 없습니다.</div>;
  const mine = settlement && settlement.sid === sess.sid ? settlement : null;
  if (settling === 'pending') return <div className="p-3 rounded-lg bg-slate-800 text-sm" data-testid="settle-pending" role="status">정산 중… 서버가 순위와 상금을 확정하는 중입니다.</div>;
  if (settling === 'error') return (
    <div className="p-3 rounded-lg bg-rose-900/70 text-sm space-y-2" data-testid="settle-error" role="alert">
      <div><b>정산 오류 — 상금 지급이 아직 완료되지 않았습니다.</b></div>
      <div className="text-xs">{settleError}</div>
      <div className="text-xs text-slate-300">경기 결과는 안전하게 저장되어 있습니다. 연결을 확인한 뒤 다시 시도하세요. 같은 결과를 여러 번 보내도 상금은 한 번만 지급됩니다.</div>
      <button className="btn !min-h-[40px] bg-rose-600" onClick={() => void finalizeTourney()} data-testid="btn-settle-retry">정산 다시 시도</button>
    </div>
  );
  if (!mine) return <div className="p-3 rounded-lg bg-slate-800 text-sm" data-testid="settle-wait">정산 대기 중…</div>;
  const total = mine.prize + mine.bounty;
  return (
    <div className="p-3 rounded-lg bg-emerald-900/50 border border-emerald-700 text-sm space-y-1" data-testid="settle-done">
      <div className="font-bold">{mine.place === 1 ? '🏆 우승 — ' : ''}{mine.place}위 / {fmt(mine.field)}명 · {mine.confirmedBy === 'server' ? '서버 확정' : '로컬 확정'}</div>
      <div data-testid="settle-prize">상금 <b className="text-yellow-300">{fmt(mine.prize)}</b>{mine.bounty > 0 && <> · 바운티 <b className="text-yellow-300">{fmt(mine.bounty)}</b></>} {total > 0 ? '→ 지갑에 지급 완료 (한 번만)' : '(입상권 밖)'}</div>
      {mine.ticket && <div className="text-amber-300" data-testid="settle-ticket">🎟 {mine.ticket.eventId} 일회성 티켓이 발행되었습니다 (액면 {fmt(mine.ticket.value)}).</div>}
      {mine.ranked ? <div className="text-sky-300" data-testid="settle-points">랭킹 포인트 {mine.points !== undefined ? `+${mine.points}` : '적립'} (같은 이벤트는 최고 성적 1건만 반영)</div> : <div className="text-slate-400 text-xs">이 경기는 랭킹 점수 대상이 아닙니다.</div>}
      <div className="flex gap-2 pt-1"><button className="btn !min-h-[34px] !py-1 bg-slate-700 text-xs" onClick={() => setScreen('wallet')} data-testid="btn-ledger">원장 내역 보기</button>{online && <button className="btn !min-h-[34px] !py-1 bg-slate-700 text-xs" onClick={() => setScreen('ranking')} data-testid="btn-to-ranking">랭킹 보기</button>}{!online && mine.ranked && <button className="btn !min-h-[34px] !py-1 bg-slate-700 text-xs" onClick={() => setScreen('ranking')} data-testid="btn-to-ranking">랭킹 보기</button>}</div>
    </div>
  );
}
