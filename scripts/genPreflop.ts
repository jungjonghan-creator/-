// 프리플랍 169 클래스의 "랜덤 핸드 대비 몬테카를로 승률" 및 백분위 표를 생성한다.
// 외부 차트/솔버 데이터 없이 자체 시뮬레이션으로 만든 근사 순위.
import { writeFileSync } from 'node:fs';
import { RANK_CHARS, makeCard } from '../src/engine/cards';
import { evaluate } from '../src/engine/evaluator';
import { createRng } from '../src/engine/rng';
import { handKey } from '../src/ai/handKey';

const rng = createRng(20240101);
const classes: { key: string; a: number; b: number; combos: number }[] = [];
for (let r1 = 14; r1 >= 2; r1--) for (let r2 = r1; r2 >= 2; r2--) {
  if (r1 === r2) classes.push({ key: RANK_CHARS[r1 - 2] + RANK_CHARS[r1 - 2], a: makeCard(r1, 0), b: makeCard(r1, 1), combos: 6 });
  else {
    classes.push({ key: RANK_CHARS[r1 - 2] + RANK_CHARS[r2 - 2] + 's', a: makeCard(r1, 0), b: makeCard(r2, 0), combos: 4 });
    classes.push({ key: RANK_CHARS[r1 - 2] + RANK_CHARS[r2 - 2] + 'o', a: makeCard(r1, 0), b: makeCard(r2, 1), combos: 12 });
  }
}
const N = 30000;
const eq: Record<string, number> = {};
for (const c of classes) {
  if (handKey(c.a, c.b) !== c.key) throw new Error('key mismatch ' + c.key);
  const avail: number[] = []; for (let i = 0; i < 52; i++) if (i !== c.a && i !== c.b) avail.push(i);
  let win = 0;
  for (let n = 0; n < N; n++) {
    // 부분 셔플로 7장 추출
    for (let i = 0; i < 7; i++) { const j = i + rng.int(avail.length - i); [avail[i], avail[j]] = [avail[j], avail[i]]; }
    const board = avail.slice(0, 5), opp = avail.slice(5, 7);
    const m = evaluate([c.a, c.b, ...board]), o = evaluate([...opp, ...board]);
    win += m > o ? 1 : m === o ? 0.5 : 0;
  }
  eq[c.key] = win / N;
}
const sorted = [...classes].sort((x, y) => eq[y.key] - eq[x.key]);
let cum = 0; const pct: Record<string, number> = {};
for (const c of sorted) { pct[c.key] = +((cum + c.combos / 2) / 1326).toFixed(4); cum += c.combos; }
const round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(4)]));
writeFileSync('src/ai/preflopTable.ts', `// 자동 생성: scripts/genPreflop.ts (랜덤 핸드 대비 몬테카를로 ${N}회). 솔버 데이터가 아닌 근사 순위.\nexport const PREFLOP_EQUITY: Record<string, number> = ${JSON.stringify(round(eq))};\nexport const PREFLOP_PCT: Record<string, number> = ${JSON.stringify(pct)};\n`);
console.log('top5', sorted.slice(0, 5).map((c) => c.key + ':' + eq[c.key].toFixed(3)), 'bottom', sorted.slice(-3).map((c) => c.key));
