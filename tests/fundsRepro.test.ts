/**
 * [자금 결함 재현] 마스터 프롬프트 §1·§3 — "탈락/우승 상금 미지급, 우승 후에도 잔액 변동 없음" 재현 테스트.
 * 수정 전에는 아래 테스트가 실패해야 하고(결함 재현), 수정 후 통과해야 한다.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from '../src/store/useGame';
import { resetDbForTests, saveAll } from '../src/persist/db';
import * as W from '../src/economy/wallet';
import { launchTournament, tournamentResult } from '../src/economy/actions';
import { tournamentById } from '../src/economy/catalog';
import { aiStep, sessionOver, Session } from '../src/game/session';
import { createRng } from '../src/engine/rng';
import { beginHand } from '../src/game/session';

const S = () => useGame.getState();
const fresh = () => {
  (globalThis as any).indexedDB = new IDBFactory();
  resetDbForTests();
  useGame.setState({ wallet: W.newWallet(), walletErrors: null, memory: {}, archive: { competitive: [], training: [] }, tourneys: [], session: null, saved: null, screen: 'menu', busy: false, notice: null, corrupt: null, ready: false, hasSave: false, settings: { sound: false, animMs: 0, revealAI: false, hints: false, autoCoach: false } });
};
beforeEach(fresh);

/** 히어로까지 AI 로 돌려 대회를 끝까지 진행 */
function playOut(s: Session, cap = 3000): Session {
  let t: Session = { ...s, aiById: { ...(s.aiById ?? {}), hero: { profileId: 'Balanced', difficulty: 3 } } };
  const rng = createRng(77);
  for (let i = 0; i < cap; i++) {
    let g = 0;
    while (t.game.toAct !== null) { if (g++ > 2000) throw new Error('loop'); t = aiStep(t).sess; }
    if (sessionOver(t)) break;
    t = beginHand(t, rng);
  }
  const { hero: _h, ...rest } = t.aiById!;
  return { ...t, aiById: rest };
}

describe('[재현1] SNG 탈락 직후 ITM 상금', () => {
  it('9인 SNG에서 히어로가 3위로 탈락하면(대회는 계속) 즉시 3위 상금이 결정되어야 한다', () => {
    const def = tournamentById('sng9a');
    const l = launchTournament(W.newWallet(), def, 'intermediate', {}, 5, { sid: 'x1', now: 1 });
    // 히어로를 3위로 탈락시킨 상태를 만든다 (나머지 2명이 아직 경쟁 중)
    const g = structuredClone(l.session.game);
    const hero = g.players.find((p) => p.isHuman)!;
    hero.busted = true; hero.stack = 0; hero.finishPlace = 3;
    const s: Session = { ...l.session, game: { ...g, gameOver: false } };
    const r = tournamentResult(s);
    expect(r).not.toBeNull();
    expect(r!.place).toBe(3);
    expect(r!.prize).toBeGreaterThan(0);
  });

  it('스토어: 탈락 직후 finalizeTourney 가 상금을 한 번만 지급하고 새로고침/재호출에도 변하지 않는다', () => {
    const def = tournamentById('sng9a');
    const l = launchTournament(W.newWallet(), def, 'intermediate', {}, 5, { sid: 'x2', now: 1 });
    const g = structuredClone(l.session.game);
    const hero = g.players.find((p) => p.isHuman)!;
    hero.busted = true; hero.stack = 0; hero.finishPlace = 2;
    const s: Session = { ...l.session, game: { ...g, gameOver: false } };
    useGame.setState({ wallet: l.wallet, session: s });
    const before = S().wallet.balance;
    S().finalizeTourney();
    const paid = S().wallet.balance - before;
    expect(paid).toBeGreaterThan(0);
    S().finalizeTourney(); S().finalizeTourney();
    expect(S().wallet.balance - before).toBe(paid);
    expect(W.verifyWallet(S().wallet)).toEqual([]);
  });
});

describe('[재현2] 종료된 저장 세션이 정산 없이 남는 경우 (우승 직후 앱 종료)', () => {
  it('끝난 대회가 저장돼 있고 계정이 열려 있으면 앱 시작 시 한 번 정산된다', async () => {
    const def = tournamentById('hu');
    let found: { s: Session; w: W.Wallet } | null = null;
    for (let seed = 1; seed < 40 && !found; seed++) {
      const l = launchTournament(W.newWallet(), def, 'beginner', {}, seed, { sid: `h${seed}`, now: 1 });
      const done = playOut(l.session);
      const r = tournamentResult(done);
      if (r && r.prize > 0) found = { s: done, w: l.wallet };
    }
    expect(found).not.toBeNull();
    const { s, w } = found!;
    expect(w.accounts[s.sid!].status).toBe('open'); // 정산 전 상태로 저장 (종료 직전 크래시 재현)
    await saveAll({ session: s, wallet: w });
    const cost = def.buyIn + def.fee;
    await S().init();
    const prize = tournamentResult(s)!.prize;
    expect(S().wallet.accounts[s.sid!].status).toBe('closed');
    expect(S().wallet.balance).toBe(30000 - cost + prize);
    expect(W.verifyWallet(S().wallet)).toEqual([]);
  });
});

describe('[재현3] MTT 시뮬레이션 완료 후 정산', () => {
  it('simToEnd 로 대회가 끝나면 계정이 닫히고 원장이 맞는다', async () => {
    S().startTournament('mtt27', 'intermediate');
    await vi.waitFor(() => expect(S().busy).toBe(false), { timeout: 20000 });
    S().simToEnd();
    await vi.waitFor(() => expect(S().session!.mtt!.finished || S().session!.mtt!.heroOut).toBe(true), { timeout: 60000 });
    await vi.waitFor(() => expect(S().busy).toBe(false), { timeout: 60000 });
    const s = S().session!;
    if (s.mtt!.heroCanReenter) S().declineReentry();
    const acct = S().wallet.accounts[s.sid!];
    expect(acct.status).toBe('closed');
    expect(W.verifyWallet(S().wallet)).toEqual([]);
  }, 120000);
});
