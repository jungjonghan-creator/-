import { hasDuplicates } from '../engine/cards';
import { checkInvariants } from '../engine/game';
import { verifyRecord } from '../engine/replay';
import { GameState } from '../engine/types';
import type { Session } from '../game/session';

export const SCHEMA_VERSION = 1;
export interface ValidationResult { ok: boolean; errors: string[] }

/** 진행 중/종료 핸드의 카드 위치가 덱 순서와 정확히 일치하는지 검사 */
export function validateDeckConsistency(g: GameState): string[] {
  const errs: string[] = [];
  if (g.handNo === 0) return errs;
  if (g.deck.length !== 52 || hasDuplicates(g.deck)) return ['덱이 손상됨'];
  const inHand = g.players.map((p, i) => ({ p, i })).filter(({ p }) => p.inHand);
  const n = g.players.length;
  const order: number[] = [];
  let c = g.sbSeat;
  for (let k = 0; k < n; k++) { if (g.players[c].inHand) order.push(c); c = (c + 1) % n; }
  if (order.length !== inHand.length) errs.push('좌석 순서 불일치');
  order.forEach((seat, idx) => {
    const exp = [g.deck[idx], g.deck[order.length + idx]];
    if (JSON.stringify(g.players[seat].hole) !== JSON.stringify(exp)) errs.push(`좌석 ${seat} 홀카드가 덱과 불일치`);
  });
  const base = order.length * 2;
  const expBoard = [g.deck[base + 1], g.deck[base + 2], g.deck[base + 3], g.deck[base + 5], g.deck[base + 7]].slice(0, g.board.length);
  if (JSON.stringify(g.board) !== JSON.stringify(expBoard)) errs.push('보드가 덱과 불일치');
  return errs;
}

export function validateSession(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const s = raw as Session;
  try {
    if (!s || typeof s !== 'object') return { ok: false, errors: ['세션 객체가 아님'] };
    if (s.version !== SCHEMA_VERSION) errors.push(`지원하지 않는 버전: ${s.version}`);
    if (!s.game || !Array.isArray(s.game.players) || !s.config || !Array.isArray(s.records)) return { ok: false, errors: [...errors, '필수 필드 누락'] };
    const g = s.game;
    if (g.players.some((p) => !Number.isInteger(p.stack) || p.stack < 0)) errors.push('잘못된 스택');
    errors.push(...checkInvariants(g));
    errors.push(...validateDeckConsistency(g));
    s.records.forEach((r, i) => { const e = verifyRecord(r); if (e.length) errors.push(`핸드 기록 #${i + 1}: ${e.join(', ')}`); });
  } catch (e) {
    errors.push('검증 중 오류: ' + (e as Error).message);
  }
  return { ok: errors.length === 0, errors };
}

/** 데이터 버전 마이그레이션 (현재 v1 → v1). 미래 버전이면 거부. */
export function migrate(raw: any): any {
  if (!raw || typeof raw !== 'object') throw new Error('손상된 데이터');
  if (raw.version === SCHEMA_VERSION) return raw;
  throw new Error(`마이그레이션 경로 없음: v${raw.version}`);
}
