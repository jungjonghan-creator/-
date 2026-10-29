/** 공식 AI 세계 스냅샷 생성: `npx tsx scripts/buildWorld.ts` → src/world/data/season.json */
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildWorld } from '../src/world/season';
const t = Date.now();
const snap = buildWorld({});
const json = JSON.stringify(snap);
writeFileSync('src/world/data/season.json', json);
const sha = createHash('sha256').update(json).digest('hex');
writeFileSync('src/world/data/season.sha256', sha + '\n');
console.log(`이벤트 ${snap.events.length}개, 크기 ${(json.length / 1024).toFixed(0)}KB, sha256 ${sha.slice(0, 16)}…, ${((Date.now() - t) / 1000).toFixed(1)}s`);
