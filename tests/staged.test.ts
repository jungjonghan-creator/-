import { describe, expect, it } from 'vitest';
import { launchTournament, tournamentResult, settleTournament } from '../src/economy/actions';
import { worldDef } from '../src/economy/catalog';
import { templateById } from '../src/world/calendar';
import { aiStep, beginHand, sessionOver, Session } from '../src/game/session';
import { stagedAfterHand, startNextRound, placeOnElimination } from '../src/game/staged';
import { createRng } from '../src/engine/rng';
import { paidPlacesOf, prizeAtPlace, shootoutGroups, shootoutLayout, prizeStructure } from '../src/world/prizes';
import * as W from '../src/economy/wallet';

/** 영웅까지 AI(균형형)로 돌려 단계형 이벤트를 끝까지 진행 */
function playAll(s0: Session, seed: number, heroLevel = 3): { s: Session; matches: number } {
  let s: Session = { ...s0, aiById: { ...(s0.aiById ?? {}), hero: { profileId: 'Balanced', difficulty: heroLevel as 3 } } };
  const rng = createRng(seed);
  let matches = 1;
  for (let guard = 0; guard < 4000 && !sessionOver(s); guard++) {
    let g = 0;
    while (s.game.toAct !== null) { if (g++ > 3000) throw new Error('loop'); s = aiStep(s).sess; }
    s = stagedAfterHand(s);
    if (sessionOver(s)) break;
    if (s.staged!.advance) { s = startNextRound(s, rng); matches++; s = { ...s, aiById: { ...(s.aiById ?? {}), hero: { profileId: 'Balanced', difficulty: heroLevel as 3 } } }; continue; }
    s = beginHand(s, rng);
  }
  return { s, matches };
}

describe('단계형 이벤트: 헤즈업 토너먼트표 / 슛아웃', () => {
  it('동순위 묶음과 상금 분배: 헤즈업 64강 · 슛아웃 108명(6인 테이블)', () => {
    const hu = templateById('seoul-hu');
    const total = Array.from({ length: 64 }, (_, i) => prizeAtPlace(hu, 64, i + 1)).reduce((a, b) => a + b, 0);
    expect(total).toBe(prizeStructure(hu, 64).prizePool);                    // 합계 = 상금 풀
    expect(paidPlacesOf(hu, 64)).toBeGreaterThanOrEqual(8);
    const sh = templateById('kcl-shoot');
    const lay = shootoutLayout(108, 6);
    expect(lay.finalSize).toBe(3); expect(lay.eliminated).toEqual([90, 15]);
    const groups = shootoutGroups(108, 6);
    expect(groups.flat().length).toBe(108); expect(new Set(groups.flat()).size).toBe(108);
    const sum = Array.from({ length: 108 }, (_, i) => prizeAtPlace(sh, 108, i + 1)).reduce((a, b) => a + b, 0);
    expect(sum).toBe(prizeStructure({ ...sh, paidPct: Math.min(0.5, 6 / 108) }, 108).prizePool);
  });
  it('순위 계산: 헤즈업 라운드 탈락/슛아웃 탈락', () => {
    const base = { kind: 'hu' as const, entries: 64, tableSize: 2, round: 1, final: false };
    expect(placeOnElimination({ ...base } as never)).toBe(33);
    expect(placeOnElimination({ ...base, round: 6, final: true } as never)).toBe(2);
    const sh = { kind: 'shootout' as const, entries: 108, tableSize: 6, final: false };
    expect(placeOnElimination({ ...sh, round: 1 } as never)).toBe(19);
    expect(placeOnElimination({ ...sh, round: 2 } as never)).toBe(4);
    expect(placeOnElimination({ ...sh, round: 3, final: true } as never, 2)).toBe(2);
  });
  it('헤즈업 토너먼트표(32): 끝까지 진행 → 한 번 정산, 원장 검산', () => {
    const def = worldDef(templateById('seoul-hu-hyper'));
    expect(def.entrants).toBe(32); expect(def.staged).toBe('hu');
    const l = launchTournament(W.newWallet(), def, 'intermediate', {}, 31, { sid: 'h1', now: 1 });
    expect(l.wallet.balance).toBe(30000 - 300 - 30);
    const { s, matches } = playAll(l.session, 5);
    expect(sessionOver(s)).toBe(true);
    const r = tournamentResult(s)!;
    expect(r.field).toBe(32); expect(r.place).toBeGreaterThanOrEqual(1); expect(r.place).toBeLessThanOrEqual(32);
    expect(matches).toBe(s.staged!.heroPlace === 1 ? 5 : Math.log2(32) - Math.floor(Math.log2(Math.max(1, s.staged!.heroPlace! - 1))) );
    expect(r.prize).toBe(prizeAtPlace(templateById('seoul-hu-hyper'), 32, r.place));
    const w1 = settleTournament(l.wallet, s, 2);
    expect(settleTournament(w1, s, 3)).toBe(w1);
    expect(W.verifyWallet(w1)).toEqual([]);
    expect(w1.balance).toBe(30000 - 330 + r.prize);
  }, 120000);
  it('슛아웃(108, 6인 테이블): 라운드 진행·결승 테이블·정산', () => {
    const def = worldDef(templateById('kcl-shoot'));
    expect(def.entrants).toBe(108); expect(def.staged).toBe('shootout');
    const l = launchTournament(W.newWallet(), def, 'intermediate', {}, 77, { sid: 's1', now: 1 });
    expect(l.session.staged!.tables.length).toBe(18);
    const { s } = playAll(l.session, 9);
    const r = tournamentResult(s)!;
    expect(sessionOver(s)).toBe(true); expect(r.place).toBeGreaterThanOrEqual(1);
    const w = settleTournament(l.wallet, s, 2);
    expect(W.verifyWallet(w)).toEqual([]);
    expect(w.accounts['s1'].status).toBe('closed');
  }, 120000);
});
