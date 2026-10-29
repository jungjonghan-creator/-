/** 레전드/가상 대표/일반 AI 의 세계 장기 랭킹 분포 (스냅샷 기준) */
import snapJson from '../src/world/data/season.json';
import type { WorldSnapshot } from '../src/world/season';
import { aiEntities } from '../src/world/field';
import { buildPointRows, computeRanking } from '../src/world/rankings';
import { absDay } from '../src/world/points';
const SNAP = snapJson as unknown as WorldSnapshot;
const ents = aiEntities();
const rows = buildPointRows(SNAP, ents, SNAP.roster, []);
for (const [label, q] of [['장기(36개월)', { scope: 'long' as const, cutoff: absDay(2035, 365) }], ['2035 시즌', { scope: 'season' as const, season: 2035, cutoff: absDay(2035, 365) }]] as const) {
  const r = computeRanking(ents, rows, { ...q, limit: 100000 });
  const by = (k: string) => r.rows.filter((x) => x.kind === k && !x.unranked);
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
  const L = by('ai-legend'), F = by('ai-future'), Rg = by('ai-regular');
  console.log(`${label}: 랭킹 ${r.rankedCount}명 · 레전드 ${L.length}명 중앙순위 ${med(L.map((x) => x.rank))} 최고 ${Math.min(...L.map((x) => x.rank))} · 상위100 중 ${r.rows.slice(0, 100).filter((x) => x.kind === 'ai-legend').length}명 · 상위30 중 ${r.rows.slice(0, 30).filter((x) => x.kind === 'ai-legend').length}명 / 가상대표 중앙 ${med(F.map((x) => x.rank))} / 일반 중앙 ${med(Rg.map((x) => x.rank))}`);
  console.log('  레전드 이벤트수 평균', (L.reduce((s, x) => s + x.events, 0) / L.length).toFixed(1), ' 가상 ', (F.reduce((s, x) => s + x.events, 0) / F.length).toFixed(1), ' 일반 ', (Rg.reduce((s, x) => s + x.events, 0) / Rg.length).toFixed(1));
  console.log('  상위 12:', r.rows.slice(0, 12).map((x) => `${x.rank}.${x.name}${x.kind === 'ai-legend' ? '★' : ''}`).join(' '));
}
