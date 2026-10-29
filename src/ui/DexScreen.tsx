import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../store/useGame';
import { NAMED, SEED_META, WorldPlayer } from '../world/cast';
import { loadSnapshot } from '../world/snapshot';
import type { WorldSnapshot } from '../world/season';
import { ALL_RANKED } from '../world/field';
import { absDay, ageWeight, eventPoints } from '../world/points';
import { EVENT_TEMPLATES, worldDay } from '../world/calendar';
import { isRankedEvent } from '../world/rankings';
import { estimate } from '../ai/opponentModel';

const KIND_LABEL = { real_legacy: '실존 레전드 (2026 전성기 타임캡슐)', fictional_2035: '2035 가상 인물', roster: '고정 로스터 (기존 POKER ARENA)' } as const;
const BARS: [keyof WorldPlayer['skill'], string][] = [['preflop', '프리플랍'], ['postflop', '포스트플랍'], ['icm', 'ICM'], ['headsup', '헤즈업'], ['exploit', '익스플로잇'], ['adaptation', '적응'], ['consistency', '꾸준함'], ['risk', '위험 감수'], ['aggression', '공격성']];
const EVIDENCE: Record<WorldPlayer['evidenceLevel'], string> = { confirmed_result: '대회 결과(공개 기록) 기반', public_interview: '공개 인터뷰 기반', reported_style: '보도된 스타일 기반', design_hypothesis: '설계 가설(창작)' };

function Detail({ p, snap }: { p: WorldPlayer; snap: WorldSnapshot | null }) {
  const { memory } = useGame();
  const st = memory[p.id];
  const stat = useMemo(() => {
    if (!snap) return null;
    const idx = ALL_RANKED.findIndex((r) => r.id === p.id);
    const cutoff = absDay(2035, worldDay());
    let pts = 0, ev = 0, itm = 0, wins = 0, won = 0;
    for (const e of snap.events) {
      const def = EVENT_TEMPLATES.find((d) => d.id === e.id)!; if (!isRankedEvent(def)) continue;
      const row = e.ranked.find((r) => r[0] === idx); if (!row || absDay(e.season, e.day) > cutoff) continue;
      ev++; pts += eventPoints(def, row[1], e.paid, e.entries) * ageWeight(cutoff - absDay(e.season, e.day)); if (row[1] <= e.paid) itm++; if (row[1] === 1) wins++; won += row[3];
    }
    return { pts: Math.round(pts * 10) / 10, ev, itm, wins, won };
  }, [snap, p.id]);
  return (
    <div className="space-y-2 text-xs" data-testid={`dex-detail-${p.id}`}>
      <div className="text-slate-300">{p.background}</div>
      <div>강점: <b>{p.strength}</b> · 약점/대응: <b>{p.counterplay || '—'}</b></div>
      <div className="text-amber-200/90">{p.kind === 'real_legacy' ? '플레이 성향: 공개 기록 기반의 게임적 해석입니다. 실제 선수의 검증된 빈도·성격·실력이 아니며, 선수 본인의 허락·후원·참여를 의미하지 않습니다.' : p.kind === 'fictional_2035' ? '2035 가상 인물입니다. 이름·전적·성향은 모두 창작이며 동명이인과 무관합니다.' : '기존 POKER ARENA의 고정 상대입니다.'}</div>
      <div>
        <div className="text-slate-400 mb-1">실력 분해 변수 — <b>게임 시뮬레이션 파라미터(0~100)</b>이며 공식 통계가 아닙니다</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">{BARS.map(([k, l]) => <div key={k} className="flex items-center gap-2"><span className="w-20 text-slate-400">{l}</span><div className="flex-1 h-2 bg-slate-800 rounded"><div className="h-2 rounded bg-sky-500" style={{ width: `${p.skill[k]}%` }} /></div><span className="w-7 text-right font-mono">{p.skill[k]}</span></div>)}</div>
      </div>
      <div className="text-slate-400">AI 엔진 프로필: {p.profileId} · 난이도 {p.difficulty} · 근거 수준: {EVIDENCE[p.evidenceLevel]} · 통계 검증: 아니오 · 선호 무대: {p.venuePreference.join(', ') || '—'}</div>
      {stat && <div className="bg-slate-800/70 rounded p-2" data-testid={`dex-stat-${p.id}`}>공식 AI 세계(2035 시즌까지, 월드 {worldDay()}일차): 포인트 {stat.pts} · 출전 {stat.ev} · ITM {stat.itm} · 우승 {stat.wins} · 누적 상금 {Math.round(stat.won).toLocaleString()}</div>}
      {st && st.hands > 0 ? <div className="bg-slate-800/70 rounded p-2">내 관찰 기록: {st.hands}핸드{st.hands >= 30 ? ` · VPIP ${(estimate.vpip(st) * 100).toFixed(0)}% PFR ${(estimate.pfr(st) * 100).toFixed(0)}%` : ' (표본 부족)'}</div> : <div className="text-slate-500">아직 이 선수와 함께 플레이한 기록이 없습니다.</div>}
      {p.evidenceSources.length > 0 && <div className="space-y-0.5"><div className="text-slate-400">공개 근거 (링크)</div>{p.evidenceSources.map((u) => <a key={u} className="block text-sky-300 underline truncate" href={u} target="_blank" rel="noopener noreferrer">{u}</a>)}</div>}
    </div>
  );
}

export function DexScreen() {
  const { setScreen } = useGame();
  const [tab, setTab] = useState<'all' | WorldPlayer['kind']>('all');
  const [region, setRegion] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [snap, setSnap] = useState<WorldSnapshot | null>(null);
  useEffect(() => { void loadSnapshot().then(setSnap); }, []);
  const list = NAMED.filter((p) => (tab === 'all' || p.kind === tab) && (!region || p.region === region) && (!q || `${p.name} ${p.nationality} ${p.homeCity}`.toLowerCase().includes(q.toLowerCase())));
  const counts = { real: NAMED.filter((p) => p.kind === 'real_legacy').length, fut: NAMED.filter((p) => p.kind === 'fictional_2035').length };
  return (
    <div className="max-w-2xl mx-auto p-3 space-y-3 overflow-y-auto h-full safe-pad" data-testid="dex">
      <div className="flex items-center gap-2"><button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="dex-back">← 뒤로</button><h1 className="text-xl font-bold">선수 도감</h1></div>
      <div className="text-[11px] text-slate-400" data-testid="dex-notice">대표 선수 {counts.real + counts.fut}명(실존 레전드 {counts.real} + 2035 가상 {counts.fut}) + 고정 로스터 15명. 세계에는 이들 외에도 수천 명의 AI와 실제 사용자가 등록됩니다 — 대표 선수 수는 상한이 아닙니다. {SEED_META.realNotice}</div>
      <div className="flex gap-1 flex-wrap">
        {([['all', '전체'], ['real_legacy', '실존 레전드'], ['fictional_2035', '2035 가상'], ['roster', '고정 로스터']] as const).map(([t, l]) => <button key={t} className={`btn !min-h-[34px] !py-1 text-xs ${tab === t ? 'bg-fuchsia-700' : 'bg-slate-700'}`} onClick={() => setTab(t)} data-testid={`dex-tab-${t}`}>{l}</button>)}
        <select className="rounded bg-slate-800 border border-slate-600 px-2 text-xs" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="지역" data-testid="dex-region"><option value="">전체 지역</option><option value="KR">한국</option><option value="ASIA">아시아</option><option value="EU">유럽</option><option value="AM">미주</option><option value="GLOBAL">글로벌</option></select>
      </div>
      <input className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm" placeholder="이름·국가·도시 검색" value={q} onChange={(e) => setQ(e.target.value)} data-testid="dex-search" />
      <div className="text-xs text-slate-500" data-testid="dex-count">{list.length}명</div>
      <ul className="space-y-1.5">
        {list.map((p) => (
          <li key={p.id} className="rounded-xl bg-slate-900 border border-slate-700 p-2" data-testid={`dex-${p.id}`}>
            <button className="w-full text-left flex items-center gap-2" onClick={() => setSel(sel === p.id ? null : p.id)}>
              <div className="w-10 h-10 rounded-full grid place-items-center font-bold text-black shrink-0" style={{ background: p.kind === 'real_legacy' ? '#f59e0b' : p.kind === 'fictional_2035' ? '#a78bfa' : '#2dd4bf' }}>{p.name.replace(/[^A-Za-z가-힣]/g, '').slice(0, 1)}</div>
              <div className="min-w-0 flex-1"><div className="font-semibold truncate">{p.name}</div><div className="text-[11px] text-slate-400">{p.nationality} · {p.homeCity} · {KIND_LABEL[p.kind]}</div></div>
              <div className="text-[10px] text-slate-400 text-right">{p.archetype.slice(0, 14)}</div>
            </button>
            {sel === p.id && <div className="mt-2 border-t border-slate-700 pt-2"><Detail p={p} snap={snap} /></div>}
          </li>
        ))}
      </ul>
      <div className="text-[11px] text-slate-500 pb-8">사진·로고·영상은 사용하지 않고 이니셜로 표시합니다. 실존 선수의 사용 권한이 확인되지 않아 외부 공개 전 가명 데이터팩으로 교체할 수 있도록 ID가 분리되어 있습니다.</div>
    </div>
  );
}
