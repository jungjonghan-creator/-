/**
 * 서킷 레귤러 풀과 임시 참가자(아마추어) 생성. 모두 가상 인물이며 결정론적이다.
 * 이름은 지역별 이름 조합으로 만든 창작 이름이고 실존 인물과 무관하다.
 */
import { createRng, RNG } from '../engine/rng';
import { difficultyOf, NAMED, Region, SkillProfile, WorldPlayer } from './cast';
import type { SimEntrant } from './batch';

const KR_SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남'];
const KR_GIV = ['민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '지후', '준서', '서연', '서윤', '지우', '서현', '하은', '하윤', '민서', '지유', '윤서', '채원', '현우', '건우', '우진', '선우', '유준', '연우', '정우', '승우', '승현', '시윤', '다은', '수아', '지민', '예은', '수빈'];
const ASIA = ['Wei Chen', 'Hao Lin', 'Kenji Mori', 'Yuki Tanaka', 'Aiko Sato', 'Ryo Hayashi', 'Minh Tran', 'Linh Pham', 'Anan Chai', 'Nida Srisai', 'Rahul Verma', 'Priya Nair', 'Budi Santoso', 'Citra Dewi', 'Jose Reyes', 'Maria Santos', 'Jia Hui Lim', 'Wen Xu', 'Ming Zhao', 'Xiao Han', 'Hana Ito', 'Sora Kimura', 'Dao Nguyen', 'Kai Wong'];
const EU = ['Luca Bianchi', 'Marta Silva', 'Jonas Becker', 'Hanna Schmidt', 'Pierre Dubois', 'Camille Laurent', 'Oskar Nilsson', 'Ingrid Berg', 'Tomas Novak', 'Eva Horvat', 'Diego Navarro', 'Lucia Ortega', 'Harry Collins', 'Grace Whitman', 'Pavel Ivanov', 'Nina Kowalski', 'Andrei Popescu', 'Sofia Moreau', 'Felix Meyer', 'Clara Jensen'];
const AM = ['Mason Clark', 'Emma Turner', 'Ethan Brooks', 'Olivia Hayes', 'Liam Foster', 'Mia Sullivan', 'Carlos Vega', 'Daniela Cruz', 'Lucas Pereira', 'Valentina Ruiz', 'Jacob Miller', 'Chloe Adams', 'Ryan Cooper', 'Zoe Mitchell', 'Andres Molina', 'Isabela Lopes', 'Noah Bennett', 'Ella Parker'];

export interface Regular {
  id: string; name: string; nationality: string; region: Region; skill: SkillProfile;
  /** 평균 참가 빈도 가중 */
  activity: number;
}

const NAT: Record<Region, string[]> = { KR: ['대한민국'], ASIA: ['일본', '대만', '중국', '베트남', '태국', '싱가포르', '필리핀', '인도', '인도네시아'], EU: ['프랑스', '독일', '이탈리아', '스페인', '영국', '폴란드', '체코'], AM: ['미국', '캐나다', '멕시코', '브라질'], GLOBAL: ['미국'] };

function pickName(region: Region, rng: RNG, serial: number): string {
  if (region === 'KR') return `${KR_SUR[rng.int(KR_SUR.length)]}${KR_GIV[rng.int(KR_GIV.length)]}`;
  const pool = region === 'ASIA' ? ASIA : region === 'EU' ? EU : AM;
  const n = pool[rng.int(pool.length)];
  const [a, ...b] = n.split(' ');
  // 같은 조합이 많아지므로 성에 기호를 붙여 구분(시리얼은 id 로 보장)
  return `${a} ${b.join(' ')}${serial % 7 === 0 ? ' Jr.' : ''}`.trim();
}

const randSkill = (rng: RNG, mean: number, sd: number): SkillProfile => {
  const g = () => (rng.next() + rng.next() + rng.next() + rng.next() - 2) * 1.7; // 근사 정규(표준편차≈1)
  const base = (extra = 0) => Math.max(20, Math.min(92, Math.round(mean + extra + g() * sd)));
  return { preflop: base(), postflop: base(), icm: base(), headsup: base(), exploit: base(-4), risk: Math.max(15, Math.min(92, Math.round(50 + g() * 18))), adaptation: base(-2), consistency: base(), aggression: Math.max(15, Math.min(92, Math.round(52 + g() * 18))) };
};

/** 시즌에 걸쳐 존재하는 레귤러 풀 (지역별 비중: KR 40%, ASIA 25%, EU 20%, AM 15%) */
export function buildRegulars(count = 1500, seed = 2035): Regular[] {
  const rng = createRng(seed);
  const out: Regular[] = [];
  const regions: Region[] = ['KR', 'ASIA', 'EU', 'AM'];
  const weights = [0.4, 0.25, 0.2, 0.15];
  for (let i = 0; i < count; i++) {
    let r = rng.next(); let ri = 0; while (ri < 3 && r > weights[ri]) { r -= weights[ri]; ri++; }
    const region = regions[ri];
    const nats = NAT[region];
    const mean = 50 + (rng.next() - 0.5) * 14; // 레귤러 평균 실력 분포
    out.push({ id: `reg${String(i).padStart(4, '0')}`, name: pickName(region, rng, i), nationality: nats[rng.int(nats.length)], region, skill: randSkill(rng, mean, 9), activity: 0.2 + rng.next() * 0.8 });
  }
  return out;
}

/** 임시 참가자(아마추어/로컬): 순위표에 올리지 않는 필드 채움용. id 로부터 이름·실력이 결정된다. */
export function amateur(eventId: string, i: number, regionBias: Region, meanSkill: number): { id: string; name: string; nationality: string; skill: SkillProfile } {
  const rng = createRng(hash(`${eventId}:${i}`));
  const region = rng.next() < 0.7 ? regionBias : (['KR', 'ASIA', 'EU', 'AM'] as Region[])[rng.int(4)];
  const nats = NAT[region === 'GLOBAL' ? 'AM' : region];
  return { id: `am:${eventId}:${i}`, name: pickName(region === 'GLOBAL' ? 'AM' : region, rng, i), nationality: nats[rng.int(nats.length)], skill: randSkill(rng, meanSkill, 11) };
}

export function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export const REGULARS: Regular[] = buildRegulars();
export interface Roster { id: string; name: string; nationality: string; region: Region; skill: SkillProfile; named?: WorldPlayer; ranked: boolean }
export const ALL_RANKED: Roster[] = [
  ...NAMED.map((p) => ({ id: p.id, name: p.name, nationality: p.nationality, region: p.region, skill: p.skill, named: p, ranked: true })),
  ...REGULARS.map((r) => ({ id: r.id, name: r.name, nationality: r.nationality, region: r.region, skill: r.skill, ranked: true })),
];
const byId = new Map(ALL_RANKED.map((r) => [r.id, r]));
export const rosterOf = (id: string): Roster | undefined => byId.get(id);

export const toSim = (r: { id: string; skill: SkillProfile }): SimEntrant => ({ id: r.id, skill: r.skill });
export { difficultyOf };

import { entityOfRoster, Entity } from './rankings';
/** AI 전체(대표 90 + 로스터 15 + 레귤러 1,500)의 통합 등록부 엔티티 */
export function aiEntities(): Map<string, Entity> {
  const m = new Map<string, Entity>();
  for (const r of ALL_RANKED) m.set(`ai:${r.id}`, entityOfRoster(r.id, r.name, r.nationality));
  return m;
}
