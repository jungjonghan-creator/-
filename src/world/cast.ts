/**
 * 2035 월드 캐스트(대표 선수 90명 = 실존 레전드 24 + 가상 66, 그리고 기존 로스터 15). 90명은 상한이 아니다 — 서버 등록부는 무제한.
 *
 * 중요: 아래 SKILL 숫자는 전부 "게임 시뮬레이션 파라미터(설계 가설)"이다.
 * 실존 선수의 실제 통계·실력 평가가 아니며, 공개된 경력/스타일 단서에서 합리적으로 유도한 아키타입을 수치화한 것이다.
 * evidence_level: confirmed_result(대회 결과) | public_interview | reported_style | design_hypothesis
 */
import seed from './data/players_seed.json';
import { ROSTER } from '../economy/roster';
import type { Difficulty } from '../ai/profiles';

export type Region = 'KR' | 'ASIA' | 'EU' | 'AM' | 'GLOBAL';
export type EvidenceLevel = 'confirmed_result' | 'public_interview' | 'reported_style' | 'design_hypothesis';

/** 분해된 내부 실력 변수 (0~100, 시뮬레이션 파라미터) */
export interface SkillProfile {
  preflop: number; postflop: number; icm: number; headsup: number; exploit: number;
  /** 0 = 위험 회피, 100 = 위험 감수(루즈) */
  risk: number; adaptation: number; consistency: number;
  /** 공격성 0~100 */
  aggression: number;
}

export interface WorldPlayer {
  id: string;
  name: string;
  nationality: string;
  region: Region;
  homeCity: string;
  kind: 'real_legacy' | 'fictional_2035' | 'roster';
  /** 이 선수의 실력 분해 변수 (모두 시뮬레이션 파라미터) */
  skill: SkillProfile;
  archetype: string;
  /** 기존 AI 엔진 프로필 연결 (실제 라이브 플레이에서 이 성향으로 행동) */
  profileId: string;
  difficulty: Difficulty;
  cashVsMtt: number;       // 0 = 캐시 전문, 100 = 토너먼트 전문
  venuePreference: string[];
  bountyStyle: string;
  strength: string;
  counterplay: string;
  background: string;
  evidenceLevel: EvidenceLevel;
  evidenceSources: string[];
  statsVerified: false;
  rightsConfirmed: false;
  derivedOrFictional: 'derived_from_public_record' | 'fictional' | 'game_roster';
  /** 신예/고참 */
  tier: 'legend' | 'veteran' | 'rising' | 'regular';
}

const REGION_BY_COUNTRY: Record<string, Region> = {
  '대한민국': 'KR', '대만': 'ASIA', '중국': 'ASIA', '일본': 'ASIA', '싱가포르': 'ASIA', '베트남': 'ASIA', '태국': 'ASIA', '인도': 'ASIA', '인도네시아': 'ASIA', '필리핀': 'ASIA',
  '프랑스': 'EU', '독일': 'EU', '이탈리아': 'EU', '포르투갈': 'EU', '영국': 'EU', '스페인': 'EU',
  '미국': 'AM', '캐나다': 'AM', '멕시코': 'AM', '칠레': 'AM',
};

interface SeedPlayer {
  id: string; name: string; country: string; type: 'real_legacy' | 'fictional_2035';
  game_only_skill_vector: { preflop: number; postflop: number; icm: number; heads_up: number; exploit: number; risk_control: number; adaptation: number; consistency: number };
  featured_region?: string; home_city?: string; primary_format?: string; story?: string;
  verified_background_summary?: string; evidence_sources: string[];
  game_archetype_hypothesis: { strength?: string; potential_counterplay?: string };
}

export const difficultyOf = (s: SkillProfile): Difficulty => {
  const avg = (s.preflop + s.postflop + s.icm + s.exploit + s.adaptation) / 5;
  return (avg >= 84 ? 5 : avg >= 74 ? 4 : avg >= 62 ? 3 : 2) as Difficulty;
};

const homeCityOf = (p: SeedPlayer) => p.home_city ?? (p.featured_region ?? '').split('/')[0] ?? '';

const has = (t: string, ...ks: string[]) => ks.some((k) => t.includes(k));

/** 시드 텍스트(강점/약점/주무대)에서 게임 엔진 프로필과 공격성을 유도하는 규칙. 전부 설계 가설이다. */
function styleOf(p: SeedPlayer, v: SeedPlayer['game_only_skill_vector']): { profile: string; aggression: number; cashMtt: number; venues: string[]; bounty: string } {
  const t = `${p.game_archetype_hypothesis.strength ?? ''} ${p.primary_format ?? ''} ${p.featured_region ?? ''}`;
  let agg = 50 + (50 - v.risk_control) * 0.4;
  if (has(t, '공격', '압박', '3벳', '4벳', '오버벳', '스틸', '블러프', '적극', '전투')) agg += 20;
  if (has(t, '인내', '수동', '컨트롤', '안정', '누적', '절제', '생존', '저변동')) agg -= 16;
  agg = Math.max(18, Math.min(92, Math.round(agg)));
  const prefs = (v.preflop + v.postflop) / 2;
  let profile = 'Balanced';
  if (has(t, '적응', '익스플로잇', '패턴', '읽기', '분석')) profile = 'AdaptivePro';
  else if (has(t, '함정', '슬로우', '체크레이즈', '라이브 테이블')) profile = 'Trapper';
  else if (agg >= 72) profile = prefs >= 70 ? 'LAG' : 'Wild';
  else if (agg <= 36) profile = prefs >= 66 ? 'TAG' : 'Rock';
  else if (has(t, '버블', 'ICM', '위성', '새틀라이트', '생존')) profile = 'Nit';
  else if (agg >= 56) profile = 'TAG';
  const isCash = has(t, '캐시');
  const isMtt = has(t, 'MTT', '토너먼트', '대회', '서킷', '메인', '시리즈', 'EPT', 'WPT', 'WSOP', '위성', 'PKO', '바운티', '터보', '하이롤러', '챔피언십');
  const cashMtt = isCash && !isMtt ? 22 : isMtt && !isCash ? 88 : 55;
  const venues: string[] = [];
  const hay = `${t} ${p.home_city ?? ''}`;
  for (const k of ['EPT', 'WPT', 'WSOP', 'Triton', 'Macau', '마카오', 'Korea', '한국', 'Jeju', '제주', 'Busan', '부산', 'Seoul', '서울', 'High Roller', '하이롤러', 'Heads-Up', '헤즈업', 'PKO', 'Turbo', '터보', 'Taipei', '타이베이', 'Las Vegas', '라스베이거스', 'Paris', '파리', 'Barcelona', '바르셀로나', 'Tokyo', '도쿄']) if (hay.includes(k)) venues.push(k === '마카오' ? 'Macau' : k === '한국' ? 'Korea' : k === '제주' ? 'Jeju' : k === '부산' ? 'Busan' : k === '서울' ? 'Seoul' : k === '하이롤러' ? 'High Roller' : k === '헤즈업' ? 'Heads-Up' : k === '터보' ? 'Turbo' : k === '타이베이' ? 'Taipei' : k === '라스베이거스' ? 'Las Vegas' : k === '파리' ? 'Paris' : k === '바르셀로나' ? 'Barcelona' : k === '도쿄' ? 'Tokyo' : k);
  if (p.country === '대한민국' && !venues.includes('Korea')) venues.push('Korea');
  const bounty = has(t, 'PKO', '바운티', '현상금') ? '바운티 적극' : agg >= 66 ? '적극적' : agg <= 36 ? '보수적' : '보통';
  return { profile, aggression: agg, cashMtt, venues: [...new Set(venues)], bounty };
}

/** 공개 기록·인터뷰에서 스타일 단서가 비교적 뚜렷한 레전드만 수동 지정(설계 가설). 나머지는 규칙 유도. */
const STYLE_OVERRIDE: Record<string, { profile: string; aggression: number }> = {
  legend_durrrr: { profile: 'LAG', aggression: 88 }, legend_jungleman: { profile: 'LAG', aggression: 82 }, legend_mateos: { profile: 'LAG', aggression: 78 },
  legend_hellmuth: { profile: 'Rock', aggression: 34 }, legend_ivey: { profile: 'AdaptivePro', aggression: 62 }, legend_negreanu: { profile: 'AdaptivePro', aggression: 58 },
  legend_vanessa_selbst: { profile: 'LAG', aggression: 80 }, legend_erik_seidel: { profile: 'TAG', aggression: 48 }, legend_jennifer_harman: { profile: 'Trapper', aggression: 52 },
};

function fromSeed(p: SeedPlayer): WorldPlayer {
  const v = p.game_only_skill_vector;
  const st = { ...styleOf(p, v), ...(STYLE_OVERRIDE[p.id] ?? {}) };
  const skill: SkillProfile = { preflop: v.preflop, postflop: v.postflop, icm: v.icm, headsup: v.heads_up, exploit: v.exploit, risk: 100 - v.risk_control, adaptation: v.adaptation, consistency: v.consistency, aggression: st.aggression };
  const real = p.type === 'real_legacy';
  const avg = (v.preflop + v.postflop + v.icm + v.exploit + v.adaptation) / 5;
  return {
    id: p.id, name: p.name, nationality: p.country, region: real ? (p.country === '대한민국' ? 'KR' : 'GLOBAL') : (REGION_BY_COUNTRY[p.country] ?? 'GLOBAL'),
    homeCity: real ? (p.featured_region ?? '') : homeCityOf(p), kind: p.type, skill, archetype: p.game_archetype_hypothesis.strength ?? '', profileId: (st as { profile: string }).profile, difficulty: difficultyOf(skill),
    cashVsMtt: st.cashMtt, venuePreference: st.venues, bountyStyle: st.bounty, strength: p.game_archetype_hypothesis.strength ?? '', counterplay: p.game_archetype_hypothesis.potential_counterplay ?? '',
    background: real ? (p.verified_background_summary ?? '') : (p.story ?? ''), evidenceLevel: real ? 'reported_style' : 'design_hypothesis', evidenceSources: p.evidence_sources ?? [],
    statsVerified: false, rightsConfirmed: false, derivedOrFictional: real ? 'derived_from_public_record' : 'fictional', tier: real ? 'legend' : avg >= 72 ? 'veteran' : avg >= 60 ? 'rising' : 'regular',
  };
}

/** 기존 게임 로스터(NOVA 등 15명)도 세계의 고정 레귤러로 편입 — 기존 캐릭터 보존 */
type Row = [pre: number, post: number, icm: number, hu: number, exp: number, risk: number, adp: number, con: number, agg: number];
const S = (r: Row): SkillProfile => ({ preflop: r[0], postflop: r[1], icm: r[2], headsup: r[3], exploit: r[4], risk: r[5], adaptation: r[6], consistency: r[7], aggression: r[8] });
const ROSTER_SKILL: Record<string, Row> = {
  'r-han': [62, 58, 60, 50, 50, 28, 40, 74, 30], 'r-sunja': [58, 54, 56, 44, 44, 24, 36, 78, 26], 'r-park': [66, 60, 64, 52, 52, 34, 46, 80, 34],
  'r-lina': [64, 62, 54, 58, 58, 74, 58, 58, 76], 'r-teo': [66, 62, 56, 60, 60, 72, 62, 56, 74], 'r-jihoon': [58, 54, 46, 54, 50, 76, 48, 46, 78],
  'r-mia': [56, 54, 44, 52, 48, 80, 46, 40, 80], 'r-dokkaebi': [56, 52, 40, 54, 46, 86, 42, 36, 90], 'r-haru': [58, 54, 44, 52, 48, 82, 46, 38, 82],
  'r-ghost': [64, 66, 58, 54, 62, 46, 62, 66, 44], 'r-seoyeon': [64, 68, 58, 56, 64, 46, 64, 66, 46], 'r-noel': [62, 64, 56, 52, 60, 44, 60, 64, 44],
  'r-nova': [76, 74, 70, 66, 72, 54, 80, 80, 54], 'r-dr': [78, 76, 72, 66, 72, 52, 78, 82, 54], 'r-ian': [72, 70, 66, 62, 66, 52, 70, 76, 52],
};
function fromRoster(): WorldPlayer[] {
  return ROSTER.map((r) => {
    const skill = S(ROSTER_SKILL[r.id] ?? [60, 60, 60, 55, 55, 50, 50, 60, 50]);
    return {
      id: r.id, name: r.name, nationality: '대한민국', region: 'KR' as Region, homeCity: '부산', kind: 'roster' as const, skill, archetype: r.bio, profileId: r.profileId, difficulty: difficultyOf(skill),
      cashVsMtt: 50, venuePreference: ['Korea Club League'], bountyStyle: '보통', strength: r.bio, counterplay: '', background: `기존 POKER ARENA 고정 로스터 (${r.bio})`, evidenceLevel: 'design_hypothesis' as const,
      evidenceSources: [], statsVerified: false as const, rightsConfirmed: false as const, derivedOrFictional: 'game_roster' as const, tier: 'regular' as const,
    };
  });
}

export const SEED_META = { title: seed.title, createdOn: seed.created_on, realNotice: seed.real_player_notice, fictionalNotice: seed.fictional_notice };
export const LEGENDS: WorldPlayer[] = (seed.players as unknown as SeedPlayer[]).filter((p) => p.type === 'real_legacy').map(fromSeed);
export const FUTURE: WorldPlayer[] = (seed.players as unknown as SeedPlayer[]).filter((p) => p.type === 'fictional_2035').map(fromSeed);
export const ROSTER_PLAYERS: WorldPlayer[] = fromRoster();
/** 이름이 있는 모든 월드 선수 (대표 90 + 기존 로스터 15) */
export const NAMED: WorldPlayer[] = [...LEGENDS, ...FUTURE, ...ROSTER_PLAYERS];
export const playerById = (id: string): WorldPlayer | undefined => NAMED.find((p) => p.id === id);
