import { inviteUrl } from '../net/invite';
import { useCallback, useEffect, useState } from 'react';
import { useGame } from '../store/useGame';
import { useAccount } from '../store/useAccount';
import { fetchMyRanking, fetchRanking, MyRanking, RankingResponse, RankParams } from '../net/ranking';
import { describeRules, EntityKind, RankRow } from '../world/rankings';
import { SERIES } from '../world/calendar';
import { api } from '../net/api';

const fmt = (n: number) => Math.round(n).toLocaleString();
const KIND: Record<EntityKind, { label: string; cls: string }> = {
  human: { label: '인간 플레이어', cls: 'bg-sky-700' }, 'ai-legend': { label: '실존 레전드 AI', cls: 'bg-amber-700' }, 'ai-future': { label: '가상 AI', cls: 'bg-violet-700' },
  'ai-roster': { label: '고정 로스터 AI', cls: 'bg-teal-800' }, 'ai-regular': { label: '일반 참가 AI', cls: 'bg-slate-600' },
};
type Tab = 'world' | 'kr' | 'humans' | 'ai' | 'friends';
const PAGE = 25;

interface Group { id: string; name: string; code?: string; members: string[] }

function Row({ r, me, prevRank }: { r: RankRow; me: boolean; prevRank: number | null }) {
  const tie = r.rank > 0 && prevRank === r.rank;
  return (
    <li className={`grid grid-cols-[2.6rem_1fr_auto] items-center gap-2 px-2 py-1.5 rounded ${me ? 'bg-sky-900/60 ring-1 ring-sky-400' : 'bg-slate-900'}`} data-testid={`rank-row-${r.key}`}>
      <div className="font-mono text-sm text-center text-yellow-300">{r.unranked ? '–' : `${tie ? 'T' : ''}${r.rank}`}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap"><span className="font-semibold truncate">{r.name}</span><span className={`text-[10px] px-1.5 py-0.5 rounded ${KIND[r.kind].cls}`}>{KIND[r.kind].label}</span>{me && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-700">나</span>}</div>
        <div className="text-[11px] text-slate-400">{r.nationality} · {r.unranked ? <b className="text-slate-300">미참가 · 0점</b> : <>이벤트 {r.events} · ITM {r.itm} · 우승 {r.wins} · FT {r.finals} · 상금 {fmt(r.prize)} · 순수익 <span className={r.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{r.net >= 0 ? '+' : ''}{fmt(r.net)}</span></>}</div>
      </div>
      <div className="text-right font-mono font-bold">{r.points.toLocaleString(undefined, { maximumFractionDigits: 1 })}<div className="text-[10px] text-slate-500 font-normal">점</div></div>
    </li>
  );
}

function MyCard({ my, label }: { my: MyRanking | null; label: string }) {
  if (!my) return null;
  const v = my.world, k = my.kr, l = my.long;
  const fmtRank = (x: typeof v) => (x.row && !x.row.unranked ? `${x.rank}위 / ${x.of}명` : '미참가 · 0점');
  return (
    <div className="rounded-xl border border-sky-600/60 bg-sky-950/40 p-3 space-y-1" data-testid="my-rank">
      <div className="text-xs text-slate-300">{label}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><div className="text-[10px] text-slate-400">세계 (시즌)</div><div className="font-bold text-yellow-300" data-testid="my-world">{fmtRank(v)}</div></div>
        <div><div className="text-[10px] text-slate-400">대한민국 (시즌)</div><div className="font-bold text-yellow-300" data-testid="my-kr">{fmtRank(k)}</div></div>
        <div><div className="text-[10px] text-slate-400">세계 장기(36개월)</div><div className="font-bold text-yellow-300">{fmtRank(l)}</div></div>
      </div>
      {v.row && !v.row.unranked && (v.before.length > 0 || v.after.length > 0) && (
        <div className="text-[11px] text-slate-300" data-testid="my-neighbors">바로 앞: {v.before.map((b) => `${b.rank}위 ${b.name}`).join(', ') || '—'} · 바로 뒤: {v.after.map((b) => `${b.rank}위 ${b.name}`).join(', ') || '—'}</div>
      )}
      {v.row?.unranked && <div className="text-[11px] text-amber-200">공식 랭킹 대상 이벤트(월드 투어의 유료 대회)를 한 번 완주하면 점수가 적립되어 순위가 정해집니다. 연습·캐시·무료 충전은 점수가 되지 않습니다.</div>}
    </div>
  );
}

function Groups({ onPick, active }: { onPick: (id: string | null) => void; active: string | null }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [msg, setMsg] = useState('');
  const load = useCallback(async () => { const r = await api<{ groups: Group[] }>('GET', '/api/groups'); if (r.ok) setGroups(r.data.groups); }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="space-y-2" data-testid="groups">
      <div className="text-xs text-slate-400">친구·가족 그룹은 초대 코드로만 만들어집니다. 관계를 추정하거나 비공개 계정을 찾지 않으며, 실명은 표시되지 않습니다.</div>
      <div className="flex flex-wrap gap-2">{groups.map((g) => <button key={g.id} className={`btn !min-h-[34px] text-xs ${active === g.id ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => onPick(g.id)} data-testid={`group-${g.name}`}>{g.name} ({g.members.length}명){g.code ? ` · 코드 ${g.code}` : ''}</button>)}</div>
      {groups.filter((g) => g.code).map((g) => <button key={`inv-${g.id}`} className="btn !min-h-[34px] text-xs bg-indigo-700 w-full" data-testid={`group-invite-${g.name}`} onClick={async () => { const url = inviteUrl(g.code!); try { if (navigator.share) await navigator.share({ title: 'POKER ARENA 친구 랭킹', text: `${g.name} 그룹에 초대합니다`, url }); else { await navigator.clipboard.writeText(url); setMsg(`초대 링크를 복사했습니다: ${url}`); } } catch { setMsg(`초대 링크: ${url}`); } }}>「{g.name}」 초대 링크 보내기 (카톡·문자)</button>)}
      <div className="flex gap-2"><input className="flex-1 rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" placeholder="새 그룹 이름" value={name} onChange={(e) => setName(e.target.value)} data-testid="group-name" /><button className="btn !min-h-[38px] bg-emerald-700 text-sm" disabled={!name} onClick={async () => { const r = await api('POST', '/api/groups', { name }); setMsg(r.ok ? `만들었습니다. 초대 코드: ${(r.data as { code: string }).code}` : (r.data as { error: string }).error); setName(''); void load(); }} data-testid="group-create">만들기</button></div>
      <div className="flex gap-2"><input className="flex-1 rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" placeholder="초대 코드 입력" value={code} onChange={(e) => setCode(e.target.value)} data-testid="group-code" /><button className="btn !min-h-[38px] bg-sky-700 text-sm" disabled={!code} onClick={async () => { const r = await api('POST', '/api/groups/join', { code }); setMsg(r.ok ? '참여했습니다' : (r.data as { error: string }).error); setCode(''); void load(); }} data-testid="group-join">참여</button></div>
      {msg && <div className="text-xs text-emerald-300" data-testid="group-msg">{msg}</div>}
    </div>
  );
}

export function RankingScreen() {
  const { setScreen, localRanked, online } = useGame();
  const { user } = useAccount();
  const [tab, setTab] = useState<Tab>('world');
  const [scope, setScope] = useState<'season' | 'long' | 'all'>('season');
  const [series, setSeries] = useState('');
  const [format, setFormat] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [group, setGroup] = useState<string | null>(null);
  const [data, setData] = useState<RankingResponse | null>(null);
  const [my, setMy] = useState<MyRanking | null>(null);
  const [err, setErr] = useState('');
  const [rules, setRules] = useState(false);
  const name = user?.displayName ?? 'TETO';
  const myKey = online ? `human:${user?.id}` : 'human:local';

  const params: RankParams = {
    scope, season: 2035, series: series || undefined, format: format || undefined, q: q || undefined, offset: page * PAGE, limit: PAGE,
    nationality: tab === 'kr' ? '대한민국' : undefined, kinds: tab === 'humans' ? 'human' : tab === 'ai' ? 'ai' : undefined, group: tab === 'friends' && group ? group : undefined,
  };
  const key = JSON.stringify(params) + localRanked.length;
  useEffect(() => {
    let alive = true;
    if (tab === 'friends' && !group) { setData(null); return; }
    setErr('');
    fetchRanking(params, online, { ranked: localRanked, name }).then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setErr((e as Error).message); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMyRanking({ scope: 'season', season: 2035 }, online, { ranked: localRanked, name }).then(setMy); }, [online, localRanked.length, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  let prev: number | null = null;
  return (
    <div className="max-w-2xl mx-auto p-3 space-y-3 overflow-y-auto h-full safe-pad" data-testid="ranking">
      <div className="flex items-center gap-2">
        <button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="ranking-back">← 뒤로</button>
        <h1 className="text-xl font-bold">통합 랭킹 <span className="text-xs text-slate-400 font-normal">인간 + AI</span></h1>
      </div>
      <MyCard my={my} label={online ? `${name} · 서버 확정 기록 기준` : `${name} · 이 기기의 로컬 기록 기준 (로컬 모드)`} />
      <div className="flex gap-1 flex-wrap" role="tablist">
        {([['world', '세계 통합'], ['kr', '대한민국 통합'], ['humans', '실제 사용자만'], ['ai', 'AI만'], ['friends', '친구·가족']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} role="tab" className={`btn !min-h-[36px] !py-1 text-sm ${tab === t ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => { setTab(t); setPage(0); }} data-testid={`rank-tab-${t}`}>{l}</button>
        ))}
      </div>
      {tab === 'friends' && (online ? <Groups onPick={setGroup} active={group} /> : <div className="text-sm text-amber-200" data-testid="friends-offline">친구·가족 랭킹은 서버 계정으로 로그인해야 사용할 수 있습니다.</div>)}
      <div className="grid grid-cols-2 gap-2">
        <select className="rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" value={scope} onChange={(e) => { setScope(e.target.value as typeof scope); setPage(0); }} aria-label="기간" data-testid="rank-scope"><option value="season">2035 시즌 POY</option><option value="long">장기(최근 36개월)</option><option value="all">전체 누적</option></select>
        <select className="rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" value={series} onChange={(e) => { setSeries(e.target.value); setPage(0); }} aria-label="시리즈" data-testid="rank-series"><option value="">전체 시리즈</option>{SERIES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" value={format} onChange={(e) => { setFormat(e.target.value); setPage(0); }} aria-label="형식" data-testid="rank-format"><option value="">전체 형식</option><option value="mtt">일반 MTT</option><option value="pko">PKO·바운티</option><option value="highroller">하이롤러</option><option value="hu">헤즈업</option><option value="shootout">슛아웃</option></select>
        <input className="rounded bg-slate-800 border border-slate-600 px-2 py-2 text-sm" placeholder="선수 검색" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} data-testid="rank-search" />
      </div>
      {err && <div className="p-2 rounded bg-rose-900/60 text-sm" role="alert">{err}</div>}
      {data && (
        <>
          <div className="text-[11px] text-slate-400" data-testid="rank-meta">등록 선수 {fmt(data.registered)}명 (실제 사용자 {fmt(data.humans)} · AI {fmt(data.ais)}) · 점수 적립 {fmt(data.rankedCount)}명 · 월드 {data.worldDay}일차 · 규칙 {data.rules} · 138명은 대표 선수일 뿐 상한이 아닙니다</div>
          <ol className="space-y-1" data-testid="rank-list">{data.rows.map((r) => { const el = <Row key={r.key} r={r} me={r.key === myKey} prevRank={prev} />; prev = r.rank; return el; })}</ol>
          {!data.rows.length && <div className="text-sm text-slate-400">조건에 맞는 선수가 없습니다.</div>}
          <div className="flex items-center justify-between">
            <button className="btn !min-h-[38px] bg-slate-700 text-sm" disabled={page === 0} onClick={() => setPage(page - 1)} data-testid="rank-prev">이전</button>
            <span className="text-xs text-slate-400" data-testid="rank-page">{page + 1} / {pages}</span>
            <button className="btn !min-h-[38px] bg-slate-700 text-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} data-testid="rank-next">다음</button>
          </div>
        </>
      )}
      <button className="text-xs underline text-slate-400" onClick={() => setRules(!rules)} data-testid="rank-rules-toggle">{rules ? '산식 닫기' : '점수 산식 공개 보기'}</button>
      {rules && <ul className="list-disc pl-5 text-xs text-slate-300 space-y-1" data-testid="rank-rules">{describeRules().map((t, i) => <li key={i}>{t}</li>)}</ul>}
      <div className="text-[11px] text-slate-500 pb-8">이 순위는 한 대회에서 직접 맞붙은 결과가 아니라, 공식 AI 세계(사전 계산 스냅샷)와 각 사용자 개인 인스턴스(서버 검증)의 결과를 같은 공개 점수 단위로 환산해 정렬한 것입니다. 공식 GPI 점수를 재현한 것이 아닙니다.</div>
    </div>
  );
}
