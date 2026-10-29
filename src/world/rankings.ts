/**
 * 인간+AI 통합 랭킹 (RANKING_MODEL_v2 계약).
 * - 공식 AI 세계(스냅샷)의 확정 결과와 인간 계정의 "서버 검증된 공식 랭킹 결과"를 같은 공개 포인트 규칙(RULES_VERSION)으로 환산한다.
 * - 지갑 충전/로그인/연습 경기는 점수에 들어가지 않는다 (입력 자체가 대회 결과뿐).
 * - 같은 이벤트(시즌+템플릿)에 인간이 여러 번 도전해도 "최고 성적 1건"만 반영 → 점수 농사 방지.
 * - 이 모듈은 순수 함수라 클라이언트·서버(Worker)·테스트가 동일하게 쓴다.
 */
import { EVENT_TEMPLATES, EventDef, eventKey, seriesById, venueById } from './calendar';
import { absDay, ageWeight, eventPoints } from './points';
import { entryCost } from './prizes';
import type { WorldSnapshot } from './season';

export const RULES_VERSION = 'poy-v1';
/** 인정 이벤트: 새틀라이트(티켓이 상금)와 무료 이벤트는 점수가 없다 */
export const isRankedEvent = (e: EventDef) => e.kind !== 'satellite' && e.buyIn > 0;
const TEMPLATE = new Map(EVENT_TEMPLATES.map((e) => [e.id, e] as const));

export type EntityKind = 'human' | 'ai-legend' | 'ai-future' | 'ai-roster' | 'ai-regular';
export interface Entity { key: string; name: string; nationality: string; kind: EntityKind; region?: string; friendGroups?: string[] }
export interface HumanResult {
  humanId: string; instanceId: string; season: number; eventId: string; day: number;
  place: number; entries: number; field: number; paid: number; prize: number; cost: number; rulesVersion: string;
}
export interface PointRow { key: string; season: number; eventId: string; day: number; place: number; paid: number; field: number; points: number; prize: number; cost: number; source: 'canonical' | 'private-instance' }

export interface RankRow {
  rank: number; key: string; name: string; nationality: string; kind: EntityKind;
  points: number; events: number; itm: number; wins: number; finals: number; prize: number; net: number;
  /** 공식 랭킹 경기를 한 번도 치르지 않았으면 true (0점 · 미참가) */
  unranked: boolean;
}

export interface RankQuery {
  scope: 'season' | 'long' | 'all';
  season?: number;
  /** 기준 월드 날짜(절대일). 이후 AI 이벤트는 아직 열리지 않았다 */
  cutoff: number;
  kinds?: ('human' | 'ai' | 'legend' | 'future' | 'regular' | 'roster')[];
  nationality?: string;
  seriesId?: string;
  /** 포맷 필터 */
  format?: 'mtt' | 'hu' | 'shootout' | 'highroller' | 'pko';
  groupKeys?: string[];
  search?: string;
  offset?: number; limit?: number;
}

/** 시즌 내 AI 이벤트가 열린 날짜인지 */
const canonicalOpen = (season: number, day: number, cutoff: number) => absDay(season, day) <= cutoff;

export function entityOfRoster(id: string, name: string, nat: string): Entity {
  const kind: EntityKind = id.startsWith('legend_') ? 'ai-legend' : id.startsWith('future_') ? 'ai-future' : id.startsWith('r-') ? 'ai-roster' : 'ai-regular';
  return { key: `ai:${id}`, name, nationality: nat, kind };
}

/** 점수 원장 구축: AI(스냅샷) + 인간(최고 성적 1건/이벤트) */
export function buildPointRows(snap: WorldSnapshot, entities: Map<string, Entity>, rosterIds: string[], humans: HumanResult[]): Map<string, PointRow[]> {
  const rows = new Map<string, PointRow[]>();
  const push = (r: PointRow) => { const a = rows.get(r.key); if (a) a.push(r); else rows.set(r.key, [r]); };
  for (const ev of snap.events) {
    const def = TEMPLATE.get(ev.id); if (!def || !isRankedEvent(def)) continue;
    const cost1 = entryCost(def);
    for (const [idx, best, ent, won] of ev.ranked) {
      const id = rosterIds[idx]; const key = `ai:${id}`;
      if (!entities.has(key)) continue;
      push({ key, season: ev.season, eventId: ev.id, day: ev.day, place: best, paid: ev.paid, field: ev.entries, points: eventPoints(def, best, ev.paid, ev.entries), prize: won, cost: ent * cost1, source: 'canonical' });
    }
  }
  // 인간: 같은 (season,event)에서는 점수가 가장 높은 1건만
  const bestByEvent = new Map<string, PointRow & { _n: number }>();
  for (const h of humans) {
    const def = TEMPLATE.get(h.eventId); if (!def || !isRankedEvent(def)) continue;
    if (h.rulesVersion !== RULES_VERSION) continue;
    const key = `human:${h.humanId}`; if (!entities.has(key)) continue;
    const pts = eventPoints(def, h.place, h.paid, h.field);
    const k = `${key}|${eventKey(h.season, h.eventId)}`;
    const prev = bestByEvent.get(k);
    const row = { key, season: h.season, eventId: h.eventId, day: h.day, place: h.place, paid: h.paid, field: h.field, points: pts, prize: h.prize, cost: h.cost, source: 'private-instance' as const, _n: (prev?._n ?? 0) + 1 };
    if (!prev || pts > prev.points || (pts === prev.points && h.place < prev.place)) bestByEvent.set(k, row); else prev._n++;
  }
  for (const r of bestByEvent.values()) { const { _n, ...rest } = r; void _n; push(rest); }
  return rows;
}

function matches(def: EventDef, q: RankQuery): boolean {
  if (q.seriesId && def.seriesId !== q.seriesId) return false;
  if (q.format === 'hu' && def.kind !== 'hu') return false;
  if (q.format === 'shootout' && def.kind !== 'shootout') return false;
  if (q.format === 'mtt' && def.kind !== 'mtt') return false;
  if (q.format === 'highroller' && def.buyIn < 3000) return false;
  if (q.format === 'pko' && !def.pko) return false;
  return true;
}

const kindMatch = (k: EntityKind, kinds?: RankQuery['kinds']): boolean => {
  if (!kinds || !kinds.length) return true;
  return kinds.some((x) => (x === 'human' ? k === 'human' : x === 'ai' ? k !== 'human' : x === 'legend' ? k === 'ai-legend' : x === 'future' ? k === 'ai-future' : x === 'roster' ? k === 'ai-roster' : k === 'ai-regular'));
};

/** 통합 랭킹 계산. 동점은 공동 순위(1,2,2,4 방식), 표시 정렬은 동점 시 최근 성적→이름. */
export function computeRanking(entities: Map<string, Entity>, points: Map<string, PointRow[]>, q: RankQuery): { total: number; rows: RankRow[]; rankedCount: number } {
  const out: RankRow[] = [];
  for (const [key, e] of entities) {
    if (!kindMatch(e.kind, q.kinds)) continue;
    if (q.nationality && e.nationality !== q.nationality) continue;
    if (q.groupKeys && !q.groupKeys.includes(key)) continue;
    if (q.search && !e.name.toLowerCase().includes(q.search.toLowerCase())) continue;
    const list = (points.get(key) ?? []).filter((r) => {
      const def = TEMPLATE.get(r.eventId)!;
      if (!matches(def, q)) return false;
      if (r.source === 'canonical' && !canonicalOpen(r.season, r.day, q.cutoff)) return false;
      if (q.scope === 'season') return r.season === q.season;
      if (q.scope === 'long') return q.cutoff - absDay(r.season, r.day) < 36 * 30.4;
      return true;
    });
    let pts = 0;
    let used = list;
    if (q.scope === 'long') {
      used = list.map((r) => ({ ...r, points: Math.round(r.points * ageWeight(q.cutoff - absDay(r.season, r.day)) * 10) / 10 })).sort((a, b) => b.points - a.points).slice(0, 12);
    }
    for (const r of used) pts += r.points;
    pts = Math.round(pts * 10) / 10;
    out.push({
      rank: 0, key, name: e.name, nationality: e.nationality, kind: e.kind, points: pts, events: list.length,
      itm: list.filter((r) => r.place <= r.paid).length, wins: list.filter((r) => r.place === 1).length, finals: list.filter((r) => r.place <= 9).length,
      prize: list.reduce((s, r) => s + r.prize, 0), net: list.reduce((s, r) => s + r.prize - r.cost, 0), unranked: list.length === 0,
    });
  }
  out.sort((a, b) => (a.unranked !== b.unranked ? (a.unranked ? 1 : -1) : b.points - a.points || b.wins - a.wins || b.itm - a.itm || a.name.localeCompare(b.name)));
  let rank = 0, prev: RankRow | null = null;
  out.forEach((r, i) => {
    if (r.unranked) { r.rank = 0; return; }
    if (!prev || r.points !== prev.points) rank = i + 1;
    r.rank = rank; prev = r;
  });
  const rankedCount = out.filter((r) => !r.unranked).length;
  const off = q.offset ?? 0, lim = q.limit ?? 50;
  return { total: out.length, rows: out.slice(off, off + lim), rankedCount };
}

export const describeRules = (): string[] => [
  `규칙 버전 ${RULES_VERSION}. 한 이벤트의 점수 = 순위점 × 규모 × 바이인 × 위상.`,
  '순위점: 입상권 안에서 100×((입상자수−순위+1)/입상자수)² + 우승 40 / 2위 15 / 3위 6',
  '규모 보정: log(1+참가 엔트리)/log(1001) (0.35~1.5) — 큰 대회일수록 높다',
  '바이인 보정: 0.7 + 0.35×log10(바이인/100) — 바이인은 점수에 로그로만 반영되어 돈이 많다고 무조건 1위가 되지 않는다',
  '위상 가중: 이벤트 위상 1~5 → ×0.8 ~ ×1.3',
  '시즌 POY: 그 시즌 점수의 합. 장기 랭킹: 최근 36개월(12개월 이내 100%, 24개월 75%, 36개월 50%) 가중 상위 12개 결과',
  '같은 이벤트에 여러 번 도전해도 최고 성적 1건만 반영 (점수 농사 방지). 새틀라이트·무료 이벤트·연습 경기·지갑 충전·로그인은 점수 0',
  '인간의 점수는 서버가 검증한 개인 인스턴스 결과(규칙 버전 일치)만 적립. 공식 AI 세계의 우승자/상금 기록은 인간 결과로 바뀌지 않는다',
  '공식 GPI 점수를 재현한 것이 아니며 GPI의 36개월 가중 구조를 참고한 자체 규칙이다',
];

export { seriesById, venueById };
