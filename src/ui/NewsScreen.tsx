import { useEffect, useState } from 'react';
import { useGame } from '../store/useGame';
import { loadSnapshot } from '../world/snapshot';
import type { WorldSnapshot } from '../world/season';
import { dayToDate, templateById, worldDay, seriesById } from '../world/calendar';
import { api } from '../net/api';

const fmt = (n: number) => Math.round(n).toLocaleString();
interface Item { id: string; cat: 'canonical' | 'mine' | 'private'; at: number; title: string; body: string }

export function NewsScreen() {
  const { setScreen, tourneys, online } = useGame();
  const [snap, setSnap] = useState<WorldSnapshot | null>(null);
  const [priv, setPriv] = useState<{ name: string; eventName: string; place: number; field: number; points: number; at: number }[]>([]);
  const [filter, setFilter] = useState<'all' | Item['cat']>('all');
  useEffect(() => { void loadSnapshot().then(setSnap); }, []);
  useEffect(() => { if (online) void api<{ items: typeof priv }>('GET', '/api/news').then((r) => { if (r.ok) setPriv(r.data.items); }); }, [online]);
  const today = worldDay();
  const items: Item[] = [];
  for (const e of snap?.events ?? []) {
    if (e.season !== 2035 || e.day > today) continue;
    const def = templateById(e.id);
    items.push({ id: e.key, cat: 'canonical', at: e.day * 1000, title: `${e.winnerName} 우승 — ${def.name}`, body: `${seriesById(def.seriesId).name} · ${dayToDate(2035, e.day).label} · ${fmt(e.entries)}엔트리 · 상금 풀 ${fmt(e.prizePool)}${e.overlay ? ` (오버레이 ${fmt(e.overlay)})` : ''}` });
  }
  tourneys.slice(-10).forEach((t, i) => items.push({ id: `me${i}`, cat: 'mine', at: t.date, title: `${t.place}위 / ${t.entrants}명`, body: `내 개인 대회 · 상금 ${fmt(t.prize)} · 바이인 ${fmt(t.buyIn)}` }));
  priv.forEach((p, i) => items.push({ id: `pv${i}`, cat: 'private', at: p.at, title: `${p.name} — ${p.eventName} ${p.place}위/${p.field}명`, body: `개인 인스턴스 결과(서버 검증) · 시즌 점수 +${p.points}` }));
  const list = items.filter((i) => filter === 'all' || i.cat === filter).sort((a, b) => (a.cat === 'canonical' && b.cat === 'canonical' ? b.at - a.at : b.at - a.at)).slice(0, 60);
  const CAT = { canonical: ['공식 AI 세계', 'bg-amber-700'], mine: ['내 소식', 'bg-sky-700'], private: ['사용자 활약(개인 대회)', 'bg-emerald-700'] } as const;
  return (
    <div className="max-w-2xl mx-auto p-3 space-y-3 overflow-y-auto h-full safe-pad" data-testid="news">
      <div className="flex items-center gap-2"><button className="btn !min-h-[36px] bg-slate-700" onClick={() => setScreen('menu')} data-testid="news-back">← 뒤로</button><h1 className="text-xl font-bold">월드 뉴스</h1></div>
      <div className="text-[11px] text-slate-400">확정된 기록만 게시합니다. 공식 AI 세계 기사는 사전 계산된 시즌 스냅샷(월드 {dayToDate(2035, today).label}까지 공개)이며, 사용자 활약은 개인 인스턴스 결과라 공식 AI 세계 우승 기록과 별개입니다. 오프라인 동안 AI가 실시간으로 경기했다는 의미가 아닙니다.</div>
      <div className="flex gap-1 flex-wrap">{(['all', 'canonical', 'private', 'mine'] as const).map((f) => <button key={f} className={`btn !min-h-[32px] !py-0.5 text-xs ${filter === f ? 'bg-sky-600' : 'bg-slate-700'}`} onClick={() => setFilter(f)} data-testid={`news-tab-${f}`}>{f === 'all' ? '전체' : CAT[f][0]}</button>)}</div>
      <ul className="space-y-1.5" data-testid="news-list">{list.map((i) => <li key={i.id} className="rounded-lg bg-slate-900 border border-slate-700 p-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${CAT[i.cat][1]}`}>{CAT[i.cat][0]}</span><div className="font-semibold text-sm mt-1">{i.title}</div><div className="text-[11px] text-slate-400">{i.body}</div></li>)}</ul>
      {!list.length && <div className="text-sm text-slate-400">아직 게시할 확정 기록이 없습니다.</div>}
      <div className="pb-8" />
    </div>
  );
}
