import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../store/useGame';
import { useWorldUi } from './worldUi';
import { EVENT_TEMPLATES, EventDef, SERIES, SEASON_GROWTH, dayToDate, displayAmount, seriesById, venueById, worldDay } from '../world/calendar';
import { loadSnapshot } from '../world/snapshot';
import type { EventResult, WorldSnapshot } from '../world/season';
import { prizeStructure, entryCost } from '../world/prizes';
import { playableReason } from '../economy/catalog';
import { blindStructure } from '../game/session';
import { HANDS_PER_LEVEL } from '../game/session';
import { SPEED_LABEL } from '../game/blinds';
import { isRankedEvent } from '../world/rankings';

const fmt = (n: number) => Math.round(n).toLocaleString();
const SEASON = 2035;
const KIND_LABEL: Record<EventDef['kind'], string> = { mtt: '토너먼트', hu: '헤즈업 토너먼트표', shootout: '슛아웃', satellite: '새틀라이트' };

function formatTags(e: EventDef): string[] {
  const t: string[] = [KIND_LABEL[e.kind], SPEED_LABEL[e.speed], `${e.stackBB}BB`, e.tableSize === 2 ? '헤즈업' : `${e.tableSize}맥스`];
  if (e.pko) t.push(e.pko.mystery ? '미스터리 바운티' : 'PKO');
  if (e.reentry) t.push(`재진입 ${e.reentry.max}회`);
  if (e.lateRegLevels) t.push(`레이트 등록 ${e.lateRegLevels}레벨`);
  if (e.guarantee) t.push('보장 상금');
  if (e.invite) t.push(e.invite === 'legends' ? '레전드 초청' : e.invite === 'top-domestic' ? '국내 상위 초청' : '글로벌 상위 초청');
  return t;
}

function EventCard({ e, snap }: { e: EventDef; snap: WorldSnapshot | null }) {
  const { wallet, startTournament, walletErrors, session, hasSave } = useGame();
  const { openId, open } = useWorldUi();
  const isOpen = openId === e.id;
  const v = venueById(e.venueId); const sr = seriesById(e.seriesId);
  const today = worldDay();
  const date = dayToDate(SEASON, e.day);
  const field = Math.max(8, Math.round(e.field * (SEASON_GROWTH[SEASON] ?? 1)));
  const target = e.satelliteFor ? EVENT_TEMPLATES.find((x) => x.id === e.satelliteFor)!.buyIn : 0;
  const ps = useMemo(() => prizeStructure(e, field, target), [e, field, target]);
  const cost = entryCost(e);
  const result: EventResult | undefined = snap?.events.find((r) => r.key === `${SEASON}:${e.id}`);
  const prev = snap?.events.find((r) => r.key === `${SEASON - 1}:${e.id}`);
  const status = e.day < today ? { t: '종료 · 공식 결과 있음', c: 'bg-slate-700' } : e.day === today ? { t: '오늘 개최', c: 'bg-emerald-700' } : { t: `D-${e.day - today}`, c: 'bg-sky-800' };
  const tickets = (wallet.tickets ?? []).filter((t) => t.status === 'active' && t.eventId === e.id);
  const reason = playableReason(e);
  const poor = wallet.balance < cost;
  const lv = useMemo(() => blindStructure(e.bb0).slice(0, 8), [e.bb0]);
  const estHands = (result ?? prev)?.rounds;
  const pct = Math.round(e.paidPct * 100);
  return (
    <li className="p-3 rounded-xl border bg-slate-900" style={{ borderColor: sr.color + '99' }} data-testid={`event-${e.id}`}>
      <button className="w-full text-left flex items-start gap-2" onClick={() => open(isOpen ? null : e.id)} data-testid={`event-open-${e.id}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold">{e.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${status.c}`}>{status.t}</span>
            {!isRankedEvent(e) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700">랭킹 점수 없음</span>}
          </div>
          <div className="text-[11px] text-slate-400">{sr.name} · {v.city}({v.cityEn}) · {date.label}</div>
          <div className="flex gap-1 flex-wrap mt-1">{formatTags(e).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{t}</span>)}</div>
          <div className="text-[11px] text-slate-300 mt-1">
            {fmt(field)}명{e.reentry || e.lateRegLevels ? '+' : ''} · 바이인 <b className="text-yellow-300">{fmt(e.buyIn)}</b> 크레딧 (≈{displayAmount(e.buyIn, v.currency)} 표시용){e.feePct ? ` + 수수료 ${fmt(entryCost(e) - e.buyIn)}` : ''}
          </div>
          <div className="text-[11px] text-yellow-200">{e.kind === 'satellite' ? `티켓 ${ps.tickets}장 (메인 좌석 ${fmt(target)} 상당)` : `상금 풀 ${fmt(ps.prizePool)}${ps.overlay ? ` (오버레이 +${fmt(ps.overlay)})` : ''}${e.pko ? ` + 바운티 ${fmt(ps.bountyPool)}` : ''} · ITM ${pct}% (${ps.paid}명)`}</div>
        </div>
        <span className="text-slate-400">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="mt-3 space-y-3 border-t border-slate-700 pt-3 text-xs" data-testid={`event-detail-${e.id}`}>
          <div className="text-slate-300">{e.note}. {sr.blurb}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div>시작 스택 <b>{fmt(e.stackBB * e.bb0)}</b> ({e.stackBB}BB)</div>
            <div>1레벨 블라인드 <b>{lv[0].sb}/{lv[0].bb}</b></div>
            <div>레벨당 <b>{HANDS_PER_LEVEL[e.speed]}</b>핸드 ({SPEED_LABEL[e.speed]})</div>
            <div>예상 길이 <b>{estHands ? `약 ${estHands} 핸드` : '미측정'}</b>{estHands ? ' (공식 AI 세계 기준)' : ''}</div>
            <div>등록 상태 <b>{reason ? '개인 참가 불가' : tickets.length ? `티켓 ${tickets.length}장 보유` : poor ? '잔액 부족' : '참가 가능'}</b></div>
            <div>참가 비용 <b>{fmt(cost)}</b></div>
          </div>
          <div className="text-slate-500">앞 8레벨: {lv.map((l, i) => `${i + 1}) ${l.sb}/${l.bb}${l.ante ? `(+${l.ante})` : ''}`).join('  ')}</div>
          {e.kind !== 'satellite' && ps.payouts.length > 0 && (
            <div data-testid={`event-prizes-${e.id}`}>
              <div className="text-slate-400 mb-1">상금표 (참가자 수 확정 시 재계산 — 합계 = 상금 풀)</div>
              <div className="grid grid-cols-3 gap-x-3">{ps.payouts.slice(0, 9).map((p, i) => <div key={i} className="flex justify-between"><span>{i + 1}위</span><span className="font-mono">{fmt(p)}</span></div>)}</div>
            </div>
          )}
          {result ? (
            <div className="bg-slate-800/70 rounded p-2 space-y-1" data-testid={`event-result-${e.id}`}>
              <div className="font-bold text-sm">공식 AI 세계 확정 결과 <span className="text-[10px] font-normal text-slate-400">(사전 계산 스냅샷 · 모든 계정 동일)</span></div>
              <div>우승 <b className="text-yellow-300">{result.winnerName}</b> · 엔트리 {fmt(result.entries)} · 상금 풀 {fmt(result.prizePool)}</div>
              <ol className="grid grid-cols-2 gap-x-3">{result.top.slice(0, 10).map((t) => <li key={t.id + t.place} className="flex justify-between gap-1"><span className="truncate">{t.place}. {t.name}</span><span className="font-mono text-slate-300">{fmt(t.prize)}</span></li>)}</ol>
            </div>
          ) : prev && (
            <div className="bg-slate-800/40 rounded p-2 text-slate-400">지난 시즌({SEASON - 1}) 우승: <b className="text-slate-200">{prev.winnerName}</b> · {fmt(prev.entries)}엔트리</div>
          )}
          <div className="text-[11px] text-slate-500">내가 참가하는 경기는 나만의 <b>개인 인스턴스</b>입니다. 같은 이벤트라도 공식 AI 세계의 우승자·상금 기록은 바뀌지 않으며, 내 성적은 내 지갑과 랭킹 점수(규칙 공개)에만 반영됩니다.{e.kind === 'satellite' ? ' 상위 입상 시 메인 이벤트 일회성 티켓이 한 번만 발행됩니다.' : ''}</div>
          {reason && <div className="text-amber-200" data-testid={`event-reason-${e.id}`}>{reason}</div>}
          {!reason && (
            <div className="flex gap-2 flex-wrap">
              {tickets.length > 0 && <button className="btn flex-1 bg-gradient-to-r from-amber-600 to-amber-500 text-black" disabled={!!walletErrors || hasSave && !!session} onClick={() => startTournament(`world:${e.id}`, 'intermediate', { ticket: true })} data-testid={`event-ticket-${e.id}`}>티켓으로 참가 (−0)</button>}
              <button className="btn flex-1 bg-gradient-to-r from-sky-700 to-indigo-600 disabled:from-slate-700 disabled:to-slate-700" disabled={poor || !!walletErrors} onClick={() => startTournament(`world:${e.id}`, 'intermediate')} data-testid={`event-enter-${e.id}`}>{poor ? `잔액 부족 (필요 ${fmt(cost)})` : `참가 (−${fmt(cost)})`}</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function WorldScreen() {
  const { setScreen, wallet, notice } = useGame();
  const { preset, setPreset } = useWorldUi();
  const [snap, setSnap] = useState<WorldSnapshot | null>(null);
  const [series, setSeries] = useState('');
  const [kind, setKind] = useState('');
  const [when, setWhen] = useState<'' | 'upcoming' | 'past'>('');
  const [q, setQ] = useState('');
  useEffect(() => { void loadSnapshot().then(setSnap); }, []);
  const today = worldDay();
  const list = useMemo(() => EVENT_TEMPLATES.filter((e) => {
    if (preset === 'kr' && !venueById(e.venueId).domestic) return false;
    if (series && e.seriesId !== series) return false;
    if (kind === 'pko' && !e.pko) return false;
    if (kind === 'high' && e.buyIn < 3000) return false;
    if (kind === 'turbo' && e.speed !== 'turbo' && e.speed !== 'hyper') return false;
    if (kind === 'deep' && e.stackBB < 150) return false;
    if (kind && !['pko', 'high', 'turbo', 'deep'].includes(kind) && e.kind !== kind) return false;
    if (when === 'upcoming' && e.day < today) return false;
    if (when === 'past' && e.day >= today) return false;
    if (q && !`${e.name} ${seriesById(e.seriesId).nameEn} ${venueById(e.venueId).city} ${venueById(e.venueId).cityEn}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => a.day - b.day), [preset, series, kind, when, q, today]);
  const seriesList = SERIES.filter((s) => EVENT_TEMPLATES.some((e) => e.seriesId === s.id && (preset === 'all' || venueById(e.venueId).domestic)));
  return (
    <div className="max-w-2xl mx-auto p-3 space-y-3 overflow-y-auto h-full safe-pad" data-testid="world">
      <div className="flex items-center gap-2">
        <button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="world-back">← 뒤로</button>
        <h1 className="text-xl font-bold">{preset === 'kr' ? '한국 포커' : '경기 찾기 · 월드 투어'}</h1>
        <div className="ml-auto text-right"><div className="text-[10px] text-slate-400">월드 {dayToDate(SEASON, today).label}</div><div className="font-bold text-yellow-300" data-testid="world-balance">{fmt(wallet.balance)}</div></div>
      </div>
      <div className="flex gap-2">
        <button className={`btn flex-1 !min-h-[40px] ${preset === 'all' ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setPreset('all')} data-testid="world-tab-all">월드 투어</button>
        <button className={`btn flex-1 !min-h-[40px] ${preset === 'kr' ? 'bg-rose-700' : 'bg-slate-700'}`} onClick={() => setPreset('kr')} data-testid="world-tab-kr">한국 포커</button>
      </div>
      {notice && <div className="p-2 rounded bg-rose-900/60 text-sm" role="alert" data-testid="world-notice">{notice}</div>}
      <div className="grid grid-cols-2 gap-2">
        <select className="rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" value={series} onChange={(e) => setSeries(e.target.value)} aria-label="시리즈" data-testid="world-series"><option value="">전체 시리즈</option>{seriesList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="형식" data-testid="world-kind">
          <option value="">전체 형식</option><option value="mtt">토너먼트</option><option value="pko">PKO·바운티</option><option value="turbo">터보·하이퍼</option><option value="deep">딥스택</option><option value="high">하이롤러(3,000+)</option><option value="satellite">새틀라이트</option><option value="hu">헤즈업 표</option><option value="shootout">슛아웃</option>
        </select>
        <select className="rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" value={when} onChange={(e) => setWhen(e.target.value as '' | 'upcoming' | 'past')} aria-label="일정" data-testid="world-when"><option value="">전체 일정</option><option value="upcoming">예정</option><option value="past">종료(공식 결과)</option></select>
        <input className="rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" placeholder="이름·도시 검색" value={q} onChange={(e) => setQ(e.target.value)} data-testid="world-search" />
      </div>
      <div className="text-[11px] text-slate-500">잠금·선행 조건 없음 — 자금과 티켓만 있으면 어떤 이벤트든 참가합니다. 시리즈·선수는 2035 가상 설정이며 실제 대회와 제휴하지 않습니다 (실제 투어는 구성 참고용).</div>
      <ul className="space-y-2">{list.map((e) => <EventCard key={e.id} e={e} snap={snap} />)}</ul>
      {!list.length && <div className="text-sm text-slate-400" data-testid="world-empty">조건에 맞는 이벤트가 없습니다.</div>}
      <div className="pb-8" />
    </div>
  );
}
