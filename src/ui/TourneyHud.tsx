import { useMemo, useState } from 'react';
import { STAGES, TourneyStatus, tourneyStatus, ZONE_LABEL } from '../game/tourney';
import { Session } from '../game/session';

const zoneCls = { comfortable: 'bg-emerald-700', pressure: 'bg-yellow-600 text-black', danger: 'bg-orange-600', shove: 'bg-rose-700' } as const;
const fmt = (n: number) => Math.round(n).toLocaleString();

export function TourneyHud({ sess }: { sess: Session }) {
  const st = useMemo<TourneyStatus | null>(() => tourneyStatus(sess), [sess.game, sess.mtt, sess.level, sess.levelHand]);
  const [open, setOpen] = useState(false);
  if (!st) return null;
  const maxChips = Math.max(st.leader.chips, 1);
  const stages = st.kind === 'sng' ? STAGES.filter((s) => s.id !== 'final') : STAGES;
  return (
    <div className="mx-2 mt-2 rounded-xl border border-slate-700 bg-slate-900/90 text-xs sm:text-sm" data-testid="tourney-hud">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-2 pt-2" data-testid="stage-stepper" aria-label="토너먼트 단계">
        {stages.map((s, i) => {
          const cur = s.id === st.stage, done = STAGES.findIndex((x) => x.id === s.id) < st.stageIndex;
          return (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              <span className={`px-2 py-0.5 rounded-full ${cur ? 'bg-sky-600 text-white font-bold' : done ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 text-slate-500'}`} data-stage={s.id} data-current={cur}>{s.label}</span>
              {i < stages.length - 1 && <span className="text-slate-600">›</span>}
            </div>
          );
        })}
        {st.registrationOpen && <span className="shrink-0 px-2 py-0.5 rounded-full bg-indigo-700 text-white" data-testid="reg-open" title="레이트 등록 진행 중">등록 중 · 신규 +{st.lateJoined}</span>}
      </div>
      <div className="grid grid-cols-3 gap-1 p-2 text-center">
        <div className="rounded-lg bg-slate-800 py-1"><div className="text-[10px] text-slate-400">내 순위</div><div className="font-bold text-base" data-testid="hud-rank">{st.heroRank}<span className="text-xs text-slate-400"> / {st.playersLeft}</span></div></div>
        <div className="rounded-lg bg-slate-800 py-1"><div className="text-[10px] text-slate-400">평균 스택</div><div className="font-bold" data-testid="hud-avg">{fmt(st.avgStack)}<span className="text-[10px] text-slate-400"> · 내 {st.heroVsAvg.toFixed(1)}×</span></div></div>
        <div className={`rounded-lg py-1 ${zoneCls[st.zone]}`}><div className="text-[10px] opacity-80">M · {ZONE_LABEL[st.zone]}</div><div className="font-bold" data-testid="hud-m">{st.M.toFixed(1)}<span className="text-[10px] opacity-80"> · {st.heroBB.toFixed(0)}BB</span></div></div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 pb-2 text-slate-300">
        <span data-testid="hud-level">레벨 {st.level} · {st.sb}/{st.bb}{st.ante ? ` a${st.ante}` : ''}{st.next ? ` → ${st.handsToNext}핸드 후 ${st.next.sb}/${st.next.bb}` : ''}</span>
        <span data-testid="hud-money" className={st.bubble ? 'text-amber-300 font-bold' : st.inTheMoney ? 'text-emerald-300' : ''}>{st.inTheMoney ? `입상 확정 · 지금 탈락 시 ${fmt(st.heroPrizeNow)}` : st.bubble ? '버블! 한 명만 더 탈락하면 입상' : `입상까지 ${st.toMoney}명`}</span>
        <span className="text-slate-500">탈락 {st.eliminated}명</span>
        <button className="ml-auto underline text-sky-300" onClick={() => setOpen(!open)} data-testid="hud-toggle">{open ? '접기' : '상세'}</button>
      </div>
      {open && (
        <div className="border-t border-slate-700 p-2 space-y-2" data-testid="hud-detail">
          <div>
            <div className="text-[11px] text-slate-400 mb-1">스택 비교 (칩리더 대비)</div>
            <div className="relative h-3 rounded bg-slate-800">
              <div className="absolute inset-y-0 left-0 rounded bg-sky-500" style={{ width: `${(st.heroChips / maxChips) * 100}%` }} />
              <div className="absolute inset-y-[-2px] w-0.5 bg-yellow-300" style={{ left: `${(st.avgStack / maxChips) * 100}%` }} title="평균 스택" />
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">파랑=내 스택 · 노랑 선=평균 · 오른쪽 끝=칩리더 {st.leader.name} {fmt(st.leader.chips)}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 mb-1">순위표</div>
            {st.top.map((s) => {
              const rank = s.isHero ? st.heroRank : st.top.indexOf(s) + 1;
              return <div key={s.id} className={`flex justify-between ${s.isHero ? 'text-sky-300 font-semibold' : ''}`}><span>{rank}. {s.name}</span><span className="font-mono">{fmt(s.chips)} <span className="text-slate-500">({(s.chips / st.bb).toFixed(0)}BB)</span></span></div>;
            })}
          </div>
          <div>
            <div className="text-[11px] text-slate-400 mb-1">상금표 (총 {st.totalEntries}엔트리, 상금 풀 {fmt(st.prizePool)})</div>
            <div className="grid grid-cols-2 gap-x-3">
              {st.payouts.slice(0, 6).map((p, i) => <div key={i} className="flex justify-between"><span>{i + 1}위</span><span className="font-mono">{fmt(p)}</span></div>)}
              <div className="col-span-2 text-slate-500">…{st.paidPlaces}위까지 입상 ({fmt(st.payouts[st.paidPlaces - 1])})</div>
            </div>
            {st.nextJump > 0 && <div className="text-[11px] text-amber-200 mt-1">한 명 더 탈락하면 내 보장 상금 +{fmt(st.nextJump)}</div>}
          </div>
          {st.icmShare !== null && (
            <div className="text-[11px] text-slate-300" data-testid="hud-icm">ICM 기대 상금 {fmt(st.icmEquity!)} ({(st.icmShare * 100).toFixed(1)}%) vs 칩 비중 {(st.chipShare * 100).toFixed(1)}% — {st.icmShare < st.chipShare ? '칩 가치가 ICM에서 할인됩니다(리스크 관리).' : '칩보다 상금 가치가 큽니다(짧은 스택의 생존 프리미엄).'}</div>
          )}
          {st.recentElims.length > 0 && <div className="text-[11px] text-slate-400">최근 탈락: {st.recentElims.map((e) => `${e.name}(${e.place}위)`).join(', ')}</div>}
        </div>
      )}
    </div>
  );
}
