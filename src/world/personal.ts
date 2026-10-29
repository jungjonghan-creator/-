/** 개인 인스턴스(월드 이벤트)용 상대 구성. 공식 AI 세계와 같은 선수 풀·같은 규칙으로 필드를 만든다. */
import { createRng } from '../engine/rng';
import type { Opponent } from '../game/mtt';
import { buildField } from './season';
import { EventDef } from './calendar';
import { difficultyOf, playerById, SkillProfile } from './cast';
import { toTuple } from './fastTable';

/** 실력 벡터에서 게임 엔진 AI 프로필을 유도 (이름 있는 선수는 자기 프로필 사용) */
export function profileForSkill(s: SkillProfile): string {
  if (s.aggression >= 74) return s.preflop >= 66 ? 'LAG' : s.risk >= 70 ? 'Maniac' : 'Wild';
  if (s.aggression >= 62) return s.adaptation >= 66 ? 'AdaptivePro' : 'TAG';
  if (s.aggression <= 32) return s.risk >= 60 ? 'CallingStation' : s.preflop >= 62 ? 'TAG' : 'Nit';
  if (s.aggression <= 42) return 'Rock';
  return s.exploit >= 66 ? 'AdaptivePro' : 'Balanced';
}

export function worldOpponents(ev: EventDef, season: number, seed: number, entrants: number): Opponent[] {
  const rng = createRng(seed ^ 0x2035);
  const adj: EventDef = { ...ev, field: entrants + 1 };
  const { entrants: field } = buildField({ ...adj, invite: undefined }, season, rng, { domestic: new Map(), global: new Map() });
  // 히어로 자리를 만들기 위해 한 명 제외 (무작위, 이름 있는 선수 우선 보존)
  const idx = field.findIndex((f) => !f.ranked);
  field.splice(idx >= 0 ? idx : field.length - 1, 1);
  return field.slice(0, entrants - 1).map((f) => {
    const named = playerById(f.id);
    return { id: f.id, name: f.name, profileId: named?.profileId ?? profileForSkill(f.skill), difficulty: named?.difficulty ?? difficultyOf(f.skill), skill: toTuple(f.skill) };
  });
}
