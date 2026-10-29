/**
 * 대규모 MTT 의 "내 테이블이 아닌 테이블" 한 핸드를 배치 시뮬레이터로 진행하는 어댑터.
 * GameState 의 스택만 갱신하고(칩 보존 검사) 탈락 시 킬러(해당 팟 승자)를 반환한다 — PKO 바운티 분배에 쓰인다.
 */
import { RNG } from '../engine/rng';
import type { GameState } from '../engine/types';
import { E, playHand } from './batch';
import type { SkillProfile } from './cast';
import { PROFILES } from '../ai/profiles';

export type SkillTuple = [number, number, number, number, number, number, number, number, number];
export const toTuple = (s: SkillProfile): SkillTuple => [s.preflop, s.postflop, s.icm, s.headsup, s.exploit, s.risk, s.adaptation, s.consistency, s.aggression];
export const fromTuple = (t: SkillTuple): SkillProfile => ({ preflop: t[0], postflop: t[1], icm: t[2], headsup: t[3], exploit: t[4], risk: t[5], adaptation: t[6], consistency: t[7], aggression: t[8] });

/** 월드 선수 정보가 없는 AI(레이트 등록 봇 등)의 실력: 난이도 + 프로필 성향 */
export function skillFromSetup(profileId: string, difficulty: number): SkillProfile {
  const base = { 1: 35, 2: 44, 3: 56, 4: 68, 5: 80 }[difficulty as 1] ?? 56;
  const st = PROFILES[profileId]?.style;
  const loose = st ? Math.max(20, Math.min(90, Math.round(50 + (st.vpipMul - 1) * 28))) : 50;
  const agg = st ? Math.max(15, Math.min(92, Math.round(35 + st.bluff * 70 + (st.betSize - 0.6) * 30))) : 50;
  return { preflop: base, postflop: base, icm: base, headsup: base, exploit: base - 4, risk: loose, adaptation: base, consistency: base, aggression: agg };
}

export interface FastResult { game: GameState; kills: Record<string, string[]> }

export function fastTableHand(g: GameState, blinds: { sb: number; bb: number; ante: number }, rng: RNG, skillOf: (id: string) => SkillProfile, pressure: number): FastResult {
  const players = g.players.filter((p) => p.stack > 0);
  const table: E[] = players.map((p) => ({ eid: p.id, pid: p.id, sk: skillOf(p.id), stack: p.stack, bounty: 0, n: 1, level0: 0 }));
  const kills: Record<string, string[]> = {};
  const n = table.length;
  const btn = ((g.button % n) + n) % n;
  const before = table.reduce((a, e) => a + e.stack, 0);
  const startStacks = g.players.map((p) => p.stack);
  const r = playHand(table, btn, { rng, bb: blinds.bb, sb: blinds.sb, ante: blinds.ante, pressure });
  const after = table.reduce((a, e) => a + e.stack, 0);
  if (after !== before) throw new Error(`빠른 테이블 칩 불일치 ${before} → ${after}`);
  const stackById = new Map(table.map((e) => [e.pid, e.stack] as const));
  const ng: GameState = { ...g, players: g.players.map((p) => ({ ...p, stack: stackById.get(p.id) ?? p.stack })), button: (btn + 1) % Math.max(1, n), handNo: g.handNo + 1, startStacks };
  for (const [bi, ks] of r.kills) kills[table[bi].pid] = ks.map((k) => table[k].pid);
  return { game: ng, kills };
}
