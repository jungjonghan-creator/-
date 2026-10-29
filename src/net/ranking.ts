/** 랭킹 조회: 온라인이면 서버(인간+AI 통합), 로컬 모드면 이 기기 기록 + 공식 AI 스냅샷을 같은 규칙으로 계산 */
import { api } from './api';
import { aiEntities } from '../world/field';
import { loadSnapshot } from '../world/snapshot';
import { buildPointRows, computeRanking, HumanResult, RankQuery, RankRow, RULES_VERSION, Entity } from '../world/rankings';
import { absDay } from '../world/points';
import { worldDay } from '../world/calendar';

export interface RankingResponse { total: number; rows: RankRow[]; rankedCount: number; registered: number; humans: number; ais: number; rules: string; worldDay: number; season: number }
export interface MyView { rank: number; row: RankRow | null; of: number; before: RankRow[]; after: RankRow[] }
export interface MyRanking { key: string; world: MyView; kr: MyView; long: MyView }
export interface RankParams { scope: 'season' | 'long' | 'all'; season?: number; kinds?: string; nationality?: string; series?: string; format?: string; q?: string; offset?: number; limit?: number; group?: string }

const qs = (p: Record<string, unknown>) => Object.entries(p).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

function localQuery(p: RankParams): RankQuery {
  return {
    scope: p.scope, season: p.season ?? 2035, cutoff: absDay(2035, worldDay()), kinds: p.kinds ? (p.kinds.split(',') as RankQuery['kinds']) : undefined,
    nationality: p.nationality, seriesId: p.series, format: p.format as RankQuery['format'], search: p.q, offset: p.offset ?? 0, limit: p.limit ?? 50,
  };
}
async function localData(localRanked: HumanResult[], name: string, nationality = '대한민국') {
  const snap = await loadSnapshot();
  const ents = new Map<string, Entity>(aiEntities());
  ents.set('human:local', { key: 'human:local', name, nationality, kind: 'human' });
  const hr = localRanked.map((h) => ({ ...h, humanId: 'local' }));
  const points = buildPointRows(snap, ents, snap.roster, hr);
  return { ents, points };
}

export async function fetchRanking(p: RankParams, online: boolean, local: { ranked: HumanResult[]; name: string }): Promise<RankingResponse> {
  if (online) {
    const r = await api<RankingResponse & { error?: string }>('GET', `/api/ranking?${qs({ ...p })}`);
    if (!r.ok) throw new Error((r.data as { error?: string }).error ?? '랭킹을 불러오지 못했습니다');
    return r.data;
  }
  const { ents, points } = await localData(local.ranked, local.name);
  const q = localQuery(p);
  const res = computeRanking(ents, points, q);
  return { ...res, registered: ents.size, humans: 1, ais: ents.size - 1, rules: RULES_VERSION, worldDay: worldDay(), season: q.season ?? 2035 };
}

export async function fetchMyRanking(p: RankParams, online: boolean, local: { ranked: HumanResult[]; name: string }): Promise<MyRanking | null> {
  if (online) {
    const r = await api<MyRanking>('GET', `/api/ranking/me?${qs({ ...p })}`);
    return r.ok ? r.data : null;
  }
  const { ents, points } = await localData(local.ranked, local.name);
  const key = 'human:local';
  const base = { ...localQuery(p), limit: 100000, offset: 0 };
  const view = (qq: RankQuery): MyView => {
    const all = computeRanking(ents, points, qq).rows;
    const i = all.findIndex((r) => r.key === key);
    return { rank: i >= 0 ? all[i].rank : 0, row: i >= 0 ? all[i] : null, of: all.filter((r) => !r.unranked).length, before: i > 0 ? all.slice(Math.max(0, i - 2), i) : [], after: i >= 0 ? all.slice(i + 1, i + 3) : [] };
  };
  return { key, world: view(base), kr: view({ ...base, nationality: '대한민국' }), long: view({ ...base, scope: 'long' }) };
}
