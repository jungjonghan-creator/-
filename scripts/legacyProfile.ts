// 사용: npx tsx scripts/legacyProfile.ts <앱의 「전체 백업 내려받기」 JSON 경로>
// 백업 파일을 읽기 전용으로 열어 기존 플레이 증거(핸드 수·VPIP/PFR/3벳 등과 표본 크기)를 요약하고 체크섬을 출력한다. 아무것도 수정·삭제하지 않는다.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { legacyProfile } from '../src/analysis/legacy';
import type { HandRecord } from '../src/engine/types';

const path = process.argv[2];
if (!path) { console.error('백업 JSON 경로를 입력하세요'); process.exit(1); }
const text = readFileSync(path, 'utf8');
const sha = createHash('sha256').update(text).digest('hex');
const b = JSON.parse(text) as { data?: Record<string, unknown> };
const archive = (b.data?.archive ?? {}) as { competitive?: HandRecord[]; training?: HandRecord[] };
const tourneys = (b.data?.tourneys ?? []) as unknown[];
const prof = legacyProfile(archive.competitive ?? [], tourneys.length, path);
console.log(JSON.stringify({ sha256: sha, keys: Object.keys(b.data ?? {}), competitiveHands: archive.competitive?.length ?? 0, trainingHands: archive.training?.length ?? 0, profile: prof }, null, 2));
