/**
 * 서킷 레귤러 풀과 임시 참가자(아마추어) 생성. 모두 가상 인물이며 결정론적이다.
 * 이름은 지역별 이름 조합으로 만든 창작 이름이고 실존 인물과 무관하다.
 */
import { createRng, RNG } from '../engine/rng';
import { difficultyOf, NAMED, Region, SkillProfile, WorldPlayer } from './cast';
import type { SimEntrant } from './batch';

const KR_SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남'];
const KR_GIV = ['민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '지후', '준서', '서연', '서윤', '지우', '서현', '하은', '하윤', '민서', '지유', '윤서', '채원', '현우', '건우', '우진', '선우', '유준', '연우', '정우', '승우', '승현', '시윤', '다은', '수아', '지민', '예은', '수빈'];
const ASIA_F = ['Wei', 'Hao', 'Kenji', 'Yuki', 'Aiko', 'Ryo', 'Minh', 'Linh', 'Anan', 'Nida', 'Rahul', 'Priya', 'Budi', 'Citra', 'Jose', 'Maria', 'Jia', 'Xiao', 'Ming', 'Hana', 'Sora', 'Dao', 'Kai', 'Mei', 'Arjun', 'Lakshmi', 'Dewi', 'Noel', 'Tomoko', 'Haruto'];
const ASIA_L = ['Chen', 'Lin', 'Mori', 'Tanaka', 'Sato', 'Hayashi', 'Tran', 'Pham', 'Chai', 'Srisai', 'Verma', 'Nair', 'Santoso', 'Reyes', 'Santos', 'Lim', 'Xu', 'Zhao', 'Han', 'Ito', 'Kimura', 'Nguyen', 'Wong', 'Sharma', 'Putra', 'Cruz', 'Yamada', 'Suzuki', 'Huang', 'Teo'];
const EU_F = ['Luca', 'Marta', 'Jonas', 'Hanna', 'Pierre', 'Camille', 'Oskar', 'Ingrid', 'Tomas', 'Eva', 'Diego', 'Lucia', 'Harry', 'Grace', 'Pavel', 'Nina', 'Andrei', 'Sofia', 'Felix', 'Clara', 'Matteo', 'Elise', 'Bruno', 'Greta', 'Viktor', 'Anya', 'Hugo', 'Lena', 'Marco', 'Ines'];
const EU_L = ['Bianchi', 'Silva', 'Becker', 'Schmidt', 'Dubois', 'Laurent', 'Nilsson', 'Berg', 'Novak', 'Horvat', 'Navarro', 'Ortega', 'Collins', 'Whitman', 'Ivanov', 'Kowalski', 'Popescu', 'Moreau', 'Meyer', 'Jensen', 'Rossi', 'Fischer', 'Costa', 'Lindqvist', 'Petrov', 'Mercier', 'Vogel', 'Santini', 'Weber', 'Baptiste'];
const AM_F = ['Mason', 'Emma', 'Ethan', 'Olivia', 'Liam', 'Mia', 'Carlos', 'Daniela', 'Lucas', 'Valentina', 'Jacob', 'Chloe', 'Ryan', 'Zoe', 'Andres', 'Isabela', 'Noah', 'Ella', 'Tyler', 'Naomi', 'Diego', 'Camila', 'Owen', 'Grace', 'Mateo', 'Sienna', 'Caleb', 'Ruby', 'Julian', 'Paloma'];
const AM_L = ['Clark', 'Turner', 'Brooks', 'Hayes', 'Foster', 'Sullivan', 'Vega', 'Cruz', 'Pereira', 'Ruiz', 'Miller', 'Adams', 'Cooper', 'Mitchell', 'Molina', 'Lopes', 'Bennett', 'Parker', 'Reed', 'Hughes', 'Ortiz', 'Navarro', 'Price', 'Ward', 'Torres', 'Gómez', 'Rivera', 'Knight', 'Fox', 'Morales'];

export interface Regular {
  id: string; name: string; nationality: string; region: Region; skill: SkillProfile;
  /** 평균 참가 빈도 가중 */
  activity: number;
}

const NAT: Record<Region, string[]> = { KR: ['대한민국'], ASIA: ['일본', '대만', '중국', '베트남', '태국', '싱가포르', '필리핀', '인도', '인도네시아'], EU: ['프랑스', '독일', '이탈리아', '스페인', '영국', '폴란드', '체코'], AM: ['미국', '캐나다', '멕시코', '브라질'], GLOBAL: ['미국'] };

function pickName(region: Region, rng: RNG, serial: number): string {
  void serial;
  if (region === 'KR') return `${KR_SUR[rng.int(KR_SUR.length)]}${KR_GIV[rng.int(KR_GIV.length)]}`;
  const [F, L] = region === 'ASIA' ? [ASIA_F, ASIA_L] : region === 'EU' ? [EU_F, EU_L] : [AM_F, AM_L];
  return `${F[rng.int(F.length)]} ${L[rng.int(L.length)]}`;
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
  const used = new Set<string>(NAMED.map((p) => p.name));
  const regions: Region[] = ['KR', 'ASIA', 'EU', 'AM'];
  const weights = [0.4, 0.25, 0.2, 0.15];
  for (let i = 0; i < count; i++) {
    let r = rng.next(); let ri = 0; while (ri < 3 && r > weights[ri]) { r -= weights[ri]; ri++; }
    const region = regions[ri];
    const nats = NAT[region];
    const mean = 50 + (rng.next() - 0.5) * 14; // 레귤러 평균 실력 분포
    // 이름은 등록부 전체에서 유일해야 한다(랭킹·검색에서 동명이인 혼동 방지)
    let name = pickName(region, rng, i);
    for (let t = 0; used.has(name) && t < 30; t++) name = pickName(region, rng, i + t + 1);
    if (used.has(name)) name = `${name} ${String.fromCharCode(65 + (i % 26))}.`;
    used.add(name);
    out.push({ id: `reg${String(i).padStart(4, '0')}`, name, nationality: nats[rng.int(nats.length)], region, skill: randSkill(rng, mean, 9), activity: 0.2 + rng.next() * 0.8 });
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
