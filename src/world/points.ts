/**
 * 포인트·랭킹 규칙 (이 게임 자체의 투명한 규칙).
 * GPI(Global Poker Index)의 "최근 36개월·대회 규모·바이인·시간 경과 가중" 구조를 참고했을 뿐이며,
 * 공식 GPI 점수를 재현한다고 주장하지 않는다.
 */
import type { EventDef } from './calendar';

export const PRESTIGE_MUL = [0, 0.8, 0.9, 1, 1.15, 1.3];

/** 순위 → 기본 점수. 입상권 밖이면 0. */
export function placePoints(place: number, paid: number): number {
  if (paid <= 0 || place > paid || place < 1) return 0;
  const r = (paid - place + 1) / paid;
  return 100 * r * r + (place === 1 ? 40 : place === 2 ? 15 : place === 3 ? 6 : 0);
}
export const sizeFactor = (entries: number) => Math.max(0.35, Math.min(1.5, Math.log10(1 + entries) / Math.log10(1001)));
export const stakesFactor = (buyIn: number) => 0.7 + 0.35 * Math.log10(Math.max(100, buyIn) / 100);

export function eventPoints(def: Pick<EventDef, 'buyIn' | 'prestige'>, place: number, paid: number, entries: number): number {
  return Math.round(placePoints(place, paid) * sizeFactor(entries) * stakesFactor(def.buyIn) * PRESTIGE_MUL[def.prestige] * 10) / 10;
}

/** 36개월 가중: 12개월 이내 100%, 12~24개월 75%, 24~36개월 50%, 그 이상 0 */
export function ageWeight(daysAgo: number): number {
  const months = daysAgo / 30.4;
  if (months < 0) return 0;
  return months < 12 ? 1 : months < 24 ? 0.75 : months < 36 ? 0.5 : 0;
}
export const absDay = (season: number, day: number) => (season - 2033) * 365 + day;
