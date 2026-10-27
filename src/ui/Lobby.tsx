import { useMemo, useState } from 'react';
import { AI_LEVELS } from '../ai/profiles';
import { estimate } from '../ai/opponentModel';
import { blindStructure } from '../game/session';
import { ADAPTIVE_RULES_TEXT, SPEED_LABEL } from '../game/blinds';
import { payoutStructure } from '../game/icm';
import { CASH_TABLES, CashTable, LevelId, TOURNAMENTS, TournamentDef, entryCost, prizePoolOf, sngPrizeTable } from '../economy/catalog';
import { ROSTER } from '../economy/roster';
import { PERSONAS } from '../ai/profiles';
import { useGame } from '../store/useGame';

const fmt = (n: number) => Math.round(n).toLocaleString();
const LEVEL_LABEL = Object.fromEntries(AI_LEVELS.map((l) => [l.id, l.label])) as Record<LevelId, string>;
const EST_LEN: Record<string, string> = { free9: '35~60핸드', hu: '15~35핸드', sng9a: '40~70핸드', sng9b: '40~70핸드', sng9c: '40~70핸드', sng9d: '30~60핸드', mtt27: '약 35핸드', mtt54: '약 55핸드', mtt108: '약 100핸드', mtt216: '약 120핸드' };

function LevelPicker({ value, onChange, recommended, testid }: { value: LevelId; onChange: (l: LevelId) => void; recommended: LevelId; testid: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-slate-400">상대 AI 실력 (판돈과 별개로 선택) · 추천 조합: {LEVEL_LABEL[recommended]}</div>
      <div className="flex gap-1 flex-wrap">
        {AI_LEVELS.map((l) => (
          <button key={l.id} className={`btn !min-h-[34px] !py-1 text-xs ${value === l.id ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => onChange(l.id)} data-testid={`${testid}-${l.id}`}>{l.label}{l.id === recommended ? ' ★' : ''}</button>
        ))}
      </div>
      <div className="text-[11px] text-slate-500">{AI_LEVELS.find((l) => l.id === value)!.desc}</div>
    </div>
  );
}

function CashCard({ t }: { t: CashTable }) {
  const { wallet, startCash, walletErrors } = useGame();
  const [open, setOpen] = useState(false);
  const [buy, setBuy] = useState(t.minBuy);
  const [level, setLevel] = useState<LevelId>(t.recommended);
  const max = Math.min(t.maxBuy, wallet.balance);
  const canAfford = wallet.balance >= t.minBuy;
  const clamp = (v: number) => Math.max(t.minBuy, Math.min(max, Math.round(v / t.bb) * t.bb));
  return (
    <li className="p-3 rounded-xl border border-slate-600 bg-slate-900" data-testid={`cash-${t.id}`}>
      <button className="w-full text-left flex items-start gap-2" onClick={() => setOpen(!open)} data-testid={`cash-open-${t.id}`}>
        <div className="min-w-0 flex-1">
          <div className="font-bold">{t.name} <span className="text-slate-400 font-normal">SB {fmt(t.sb)} / BB {fmt(t.bb)}</span></div>
          <div className="text-xs text-slate-300">{t.blurb}</div>
          <div className="text-[11px] text-slate-400 mt-1">바이인 {fmt(t.minBuy)}~{fmt(t.maxBuy)} (40~100BB) · {t.seats}인 테이블 · 블라인드 고정 · 추천 AI {LEVEL_LABEL[t.recommended]}</div>
        </div>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-700 pt-3">
          {!canAfford ? <div className="text-sm text-amber-200" data-testid={`cash-poor-${t.id}`}>통장 잔액({fmt(wallet.balance)})이 최소 바이인({fmt(t.minBuy)})보다 적습니다. 더 낮은 테이블이나 프리롤·연습 경기를 이용하세요.</div> : (
            <>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300"><span>가져갈 칩 (BB 단위로 조절)</span><span className="font-mono text-yellow-300" data-testid={`cash-buy-${t.id}`}>{fmt(buy)} ({(buy / t.bb).toFixed(0)}BB)</span></div>
                <input type="range" className="w-full" min={t.minBuy} max={Math.max(t.minBuy, max)} step={t.bb} value={buy} onChange={(e) => setBuy(clamp(Number(e.target.value)))} aria-label="바이인" data-testid={`cash-slider-${t.id}`} />
                <div className="flex gap-1">{[t.minBuy, Math.round((t.minBuy + t.maxBuy) / 2 / t.bb) * t.bb, t.maxBuy].map((v) => <button key={v} className="btn !min-h-[30px] !py-0.5 text-xs bg-slate-700" disabled={v > wallet.balance} onClick={() => setBuy(clamp(v))}>{(v / t.bb).toFixed(0)}BB</button>)}</div>
              </div>
              <LevelPicker value={level} onChange={setLevel} recommended={t.recommended} testid={`cash-level-${t.id}`} />
              <button className="btn w-full bg-gradient-to-r from-emerald-700 to-emerald-600" disabled={!!walletErrors} onClick={() => startCash(t.id, buy, level)} data-testid={`cash-sit-${t.id}`}>착석 (통장 {fmt(wallet.balance)} → {fmt(wallet.balance - buy)})</button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function TournamentCard({ d }: { d: TournamentDef }) {
  const { wallet, startTournament, walletErrors } = useGame();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<LevelId>(d.recommended);
  const [mode, setMode] = useState(d.blindMode);
  const [speed, setSpeed] = useState(d.speed);
  const cost = entryCost(d);
  const poor = wallet.balance < cost;
  const payouts = d.kind === 'mtt' ? payoutStructure(d.entrants, d.buyIn) : sngPrizeTable(d);
  const pool = prizePoolOf(d);
  const lv = useMemo(() => blindStructure(d.bb).slice(0, 8), [d.bb]);
  return (
    <li className={`p-3 rounded-xl border ${d.group === 'free' ? 'border-emerald-700 bg-emerald-950/30' : 'border-slate-600 bg-slate-900'}`} data-testid={`tourney-${d.id}`}>
      <button className="w-full text-left flex items-start gap-2" onClick={() => setOpen(!open)} data-testid={`tourney-open-${d.id}`}>
        <div className="min-w-0 flex-1">
          <div className="font-bold">{d.name}{d.group === 'free' && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-700">프리롤</span>}</div>
          <div className="text-xs text-slate-300">{d.desc}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            참가 {d.entrants}명{d.lateRegUntilLevel ? '+(레이트 등록)' : ''} · 참가비 {fmt(d.buyIn)}{d.fee ? ` + 수수료 ${fmt(d.fee)}` : ''} · 시작 {d.startBB}BB · 블라인드 {SPEED_LABEL[d.speed]}/{d.blindMode === 'adaptive' ? '적응형' : '정규'}
          </div>
          <div className="text-[11px] text-yellow-200">총상금 {fmt(pool)}{d.kind === 'mtt' ? '+' : ''} · 우승 {fmt(payouts[0])} · 입상 {payouts.length}명 · 예상 {EST_LEN[d.id]}{d.reentry ? ' · 재진입 가능' : ''}</div>
        </div>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-700 pt-3 text-xs">
          <div data-testid={`prizes-${d.id}`}>
            <div className="text-slate-400 mb-1">상금 분배표 (경기 시작 전 확정){d.kind === 'mtt' ? ' — 레이트 등록으로 참가자가 늘면 풀과 입상 인원이 함께 커집니다' : ''}</div>
            <div className="grid grid-cols-3 gap-x-3">{payouts.slice(0, 9).map((p, i) => <div key={i} className="flex justify-between"><span>{i + 1}위</span><span className="font-mono">{fmt(p)}</span></div>)}</div>
            {d.fee > 0 && <div className="text-slate-500 mt-1">수수료 {fmt(d.fee)}는 상금 풀에 포함되지 않습니다. NPC 참가비도 풀에 반영됩니다(참가비 × 참가자 수).</div>}
          </div>
          <div className="space-y-1">
            <div className="text-slate-400">블라인드 정책</div>
            <div className="flex gap-1 flex-wrap">
              {(['regular', 'adaptive'] as const).map((m) => <button key={m} className={`btn !min-h-[32px] !py-0.5 text-xs ${mode === m ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setMode(m)} data-testid={`blind-${m}-${d.id}`}>{m === 'regular' ? '정규 (미리 확정)' : '상황 적응형'}</button>)}
              {(['slow', 'normal', 'turbo'] as const).map((s) => <button key={s} className={`btn !min-h-[32px] !py-0.5 text-xs ${speed === s ? 'bg-indigo-600' : 'bg-slate-700'}`} onClick={() => setSpeed(s)} data-testid={`speed-${s}-${d.id}`}>{SPEED_LABEL[s]}</button>)}
            </div>
            {mode === 'adaptive' && <ul className="list-disc pl-5 text-slate-400" data-testid={`adaptive-rules-${d.id}`}>{ADAPTIVE_RULES_TEXT.map((r, i) => <li key={i}>{r}</li>)}</ul>}
            <div className="text-slate-500">레벨 변경은 핸드가 완전히 끝난 뒤에만 적용됩니다. 정규: 레벨당 {speed === 'slow' ? 15 : speed === 'normal' ? 10 : 6}핸드. 앞 8레벨: {lv.map((l, i) => `${i + 1}) ${l.sb}/${l.bb}${l.ante ? `+${l.ante}` : ''}`).join(' · ')}</div>
          </div>
          <LevelPicker value={level} onChange={setLevel} recommended={d.recommended} testid={`tourney-level-${d.id}`} />
          {poor && <div className="text-amber-200" data-testid={`tourney-poor-${d.id}`}>참가비 {fmt(cost)}가 필요합니다 (보유 {fmt(wallet.balance)}). 캐시게임이나 프리롤로 크레딧을 모아 보세요.</div>}
          <button className="btn w-full bg-gradient-to-r from-sky-700 to-indigo-600 disabled:from-slate-700 disabled:to-slate-700" disabled={poor || !!walletErrors} onClick={() => startTournament(d.id, level, { blindMode: mode, speed })} data-testid={`tourney-start-${d.id}`}>
            {cost === 0 ? '무료 참가' : `참가 (−${fmt(cost)})`}
          </button>
        </div>
      )}
    </li>
  );
}

function RivalBook() {
  const { memory } = useGame();
  const seen = ROSTER.map((r) => ({ r, st: memory[r.id] })).filter((x) => x.st && x.st.hands > 0);
  if (!seen.length) return <div className="text-xs text-slate-500" data-testid="rivals-empty">아직 만난 상대가 없습니다. 경기를 하면 상대의 성향이 관찰·기록됩니다.</div>;
  return (
    <ul className="space-y-1" data-testid="rival-book">
      {seen.map(({ r, st }) => {
        const n = st.hands;
        const label = n >= 60 ? PERSONAS.find((p) => p.id === r.persona)!.label : '미확인';
        return (
          <li key={r.id} className="text-xs flex justify-between gap-2 bg-slate-900 rounded px-2 py-1">
            <span><b>{r.name}</b> <span className="text-slate-400">· 관찰 {n}핸드</span></span>
            <span className="text-slate-300">{label}{n >= 30 ? ` · VPIP ${(estimate.vpip(st) * 100).toFixed(0)}% PFR ${(estimate.pfr(st) * 100).toFixed(0)}%` : ''}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Lobby() {
  const { wallet, setScreen, notice, hasSave, resume, saved } = useGame();
  const [tab, setTab] = useState<'cash' | 'tourney'>('cash');
  return (
    <div className="max-w-2xl mx-auto p-3 space-y-3 overflow-y-auto h-full safe-pad" data-testid="lobby">
      <div className="flex items-center gap-2">
        <button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="lobby-back">← 뒤로</button>
        <h1 className="text-xl font-bold">로비</h1>
        <button className="ml-auto text-right" onClick={() => setScreen('wallet')} data-testid="lobby-wallet"><div className="text-[10px] text-slate-400">통장</div><div className="font-bold text-yellow-300" data-testid="lobby-balance">{fmt(wallet.balance)}</div></button>
      </div>
      {hasSave && saved && <button className="btn w-full bg-emerald-600" onClick={() => resume()} data-testid="lobby-resume">▶ 진행 중인 경기 이어하기</button>}
      <div className="flex gap-2">
        <button className={`btn flex-1 ${tab === 'cash' ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setTab('cash')} data-testid="tab-cash">캐시게임</button>
        <button className={`btn flex-1 ${tab === 'tourney' ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setTab('tourney')} data-testid="tab-tourney">토너먼트</button>
      </div>
      {notice && <div className="p-2 rounded bg-rose-900/60 text-sm" role="alert" data-testid="lobby-notice">{notice}</div>}
      {tab === 'cash' ? (
        <>
          <p className="text-xs text-slate-400">캐시게임의 블라인드는 고정입니다. 판돈을 바꾸려면 다른 테이블로 이동하세요. 칩을 가져가고(바이인) 일어날 때 남은 칩만 통장으로 돌아옵니다.</p>
          <ul className="space-y-2">{CASH_TABLES.map((t) => <CashCard key={t.id} t={t} />)}</ul>
          <h2 className="font-bold text-sm pt-2">상대 도감 (알려진 범위만)</h2>
          <RivalBook />
        </>
      ) : (
        <>
          <p className="text-xs text-slate-400">참가비는 등록 즉시 통장에서 차감되고, 상금은 탈락 순위에 따라 대회 종료 시 한 번만 지급됩니다. 파산해도 프리롤로 다시 시작할 수 있습니다.</p>
          <ul className="space-y-2">{TOURNAMENTS.map((d) => <TournamentCard key={d.id} d={d} />)}</ul>
        </>
      )}
      <div className="pb-6" />
    </div>
  );
}
