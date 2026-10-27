import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from '../src/store/useGame';
import { resetDbForTests, saveKV, saveSession, loadSession, loadWallet, saveAll } from '../src/persist/db';
import * as W from '../src/economy/wallet';
import { newSession, beginHand, defaultAIs, aiStep, sessionOver, Session } from '../src/game/session';
import { createRng } from '../src/engine/rng';
import { tournamentResult } from '../src/economy/actions';

const S = () => useGame.getState();
const fresh = async () => {
  (globalThis as any).indexedDB = new IDBFactory();
  resetDbForTests();
  useGame.setState({ wallet: W.newWallet(), walletErrors: null, memory: {}, archive: { competitive: [], training: [] }, tourneys: [], session: null, saved: null, screen: 'menu', busy: false, notice: null, corrupt: null, ready: false, hasSave: false, settings: { sound: false, animMs: 0, revealAI: false, hints: false, autoCoach: false } });
};
const settle = async () => { await vi.waitFor(() => expect(S().busy).toBe(false), { timeout: 20000 }); };
/** 앱을 껐다 켠 것과 같은 효과: 메모리 상태를 버리고 저장소에서 다시 읽는다 */
const reboot = async () => {
  useGame.setState({ wallet: W.newWallet(0, 1), session: null, saved: null, hasSave: false, ready: false, memory: {}, tourneys: [], archive: { competitive: [], training: [] }, corrupt: null, walletErrors: null });
  await S().init();
};
const heroAuto = (s: Session): Session => ({ ...s, aiById: { ...(s.aiById ?? {}), hero: { profileId: 'Balanced', difficulty: 3 } } });
function finishHand(s: Session): Session { let t = heroAuto(s); while (t.game.toAct !== null) t = aiStep(t).sess; const { hero: _h, ...rest } = t.aiById!; return { ...t, aiById: rest }; }

beforeEach(fresh);

describe('[시나리오11] 기존 저장 데이터 마이그레이션', () => {
  it('통장이 없는 구버전 데이터: 통장 신규 생성(30,000), 전적·핸드기록·진행 중인 경기는 보존', async () => {
    const legacy = beginHand(newSession({ mode: 'cash', seats: 2, startBB: 50, bb: 100, speed: 'normal', humanName: 'TETO', ais: defaultAIs(1, 3), seed: 9 }), createRng(3));
    // 구버전에는 sid/prize/tierId/levelLen 같은 필드가 없다
    const { sid: _a, prize: _b, tierId: _c, levelLen: _d, tstat: _e, ...old } = legacy as any;
    await saveSession(old as Session);
    await saveKV('tourneys', [{ date: 1, mode: 'sng', entrants: 6, place: 2, prize: 35, buyIn: 100, entries: 1 }]);
    await saveKV('archive', { competitive: [], training: [] });
    await S().init();
    expect(S().ready).toBe(true);
    expect(S().wallet.balance).toBe(30000);
    expect(W.verifyWallet(S().wallet)).toEqual([]);
    expect(S().tourneys.length).toBe(1);
    expect(S().hasSave).toBe(true);
    expect(S().saved!.game.deck).toEqual(legacy.game.deck);
    // 이어하기 + 레거시 경기는 통장과 무관(연습 취급)
    await S().resume();
    expect(S().session!.sid).toBeUndefined();
    expect(S().wallet.balance).toBe(30000);
  });
});

describe('[시나리오8·10] 새로고침 후 복원, 이어서 완료 후 새 경기', () => {
  it('캐시: 착석 → 핸드 진행 중 새로고침 → 칩·카드·통장 동일 → 퇴장 정산 → 새 경기', async () => {
    S().startCash('c2', 3000, 'intermediate');
    await settle();
    const before = S().session!;
    expect(S().wallet.balance).toBe(27000);
    expect(before.sid).toBeTruthy();
    const holes = before.game.players.map((p) => p.hole);
    const deck = before.game.deck;
    await new Promise((r) => setTimeout(r, 50)); // 비동기 저장 완료 대기
    await reboot();
    expect(S().wallet.balance).toBe(27000);                 // 통장은 그대로, 중복 차감 없음
    expect(S().wallet.accounts[before.sid!].status).toBe('open'); // 고아로 몰수되지 않음
    expect(S().hasSave).toBe(true);
    await S().resume(); await settle();
    const after = S().session!;
    expect(after.game.deck).toEqual(deck);
    after.game.players.forEach((p, i) => expect(p.hole).toEqual(holes[i]));
    expect(after.game.handNo).toBe(before.game.handNo);
    // 핸드를 끝내고 퇴장
    useGame.setState({ session: finishHand(S().session!) });
    S().leaveTable();
    const chips = S().session === null ? S().wallet.txs.find((t) => t.kind === 'cash-cashout')?.amount ?? 0 : -1;
    expect(S().wallet.balance).toBe(27000 + chips);
    expect(W.verifyWallet(S().wallet)).toEqual([]);
    expect(S().session).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    await reboot();
    expect(S().hasSave).toBe(false);                           // 끝난 경기는 이어하기에 남지 않는다
    expect(S().wallet.balance).toBe(27000 + chips);
    S().startCash('c1', 400, 'beginner');                      // 새 경기 시작 가능
    await settle();
    expect(S().wallet.balance).toBe(27000 + chips - 400);
  }, 60000);

  it('저장된 세션이 사라지면(삭제/강제 초기화) 열린 계정은 몰수 — 새로고침으로 손실을 되돌릴 수 없다', async () => {
    S().startCash('c1', 500, 'beginner'); await settle();
    const sid = S().session!.sid!;
    await new Promise((r) => setTimeout(r, 50));
    await saveAll({ session: null }); // 세션 데이터만 사라진 상황
    await reboot();
    expect(S().wallet.accounts[sid].status).toBe('closed');
    expect(S().wallet.balance).toBe(29500);
    expect(W.atTable(S().wallet)).toBe(0);
  });

  it('손상된 세션: 오류 표시 후 삭제하면 묶여 있던 바이인이 환불된다(두 번 환불되지 않음)', async () => {
    S().startTournament('sng9b', 'intermediate'); await settle();
    expect(S().wallet.balance).toBe(30000 - 1100);
    await new Promise((r) => setTimeout(r, 50));
    const s = S().session!;
    const bad = JSON.parse(JSON.stringify(s)); bad.game.deck[3] = bad.game.deck[4];
    await saveSession(bad);
    await reboot();
    expect(S().corrupt).not.toBeNull();
    expect(S().wallet.balance).toBe(30000 - 1100); // 손상 상태에서는 자동으로 건드리지 않는다
    await S().dismissCorrupt();
    expect(S().wallet.balance).toBe(30000);
    await S().dismissCorrupt();
    expect(S().wallet.balance).toBe(30000);
    expect(W.verifyWallet(S().wallet)).toEqual([]);
  });
});

describe('[시나리오7] 토너먼트 상금 중복 지급 방지 (스토어 경유)', () => {
  it('끝까지 진행 → finalize 여러 번 호출해도 상금·전적은 한 번', async () => {
    S().startTournament('sng9a', 'beginner'); await settle();
    expect(S().wallet.balance).toBe(29900);
    let s = heroAuto(S().session!); const rng = createRng(2);
    for (let i = 0; i < 500 && !sessionOver(s); i++) { if (i > 0 && s.game.street === 'complete') s = beginHand(s, rng); while (s.game.toAct !== null) s = aiStep(s).sess; }
    expect(sessionOver(s)).toBe(true);
    const r = tournamentResult(s)!;
    useGame.setState({ session: s });
    S().finalizeTourney(); S().finalizeTourney(); S().finalizeTourney();
    const expected = [540, 270, 90][r.place - 1] ?? 0;
    expect(S().wallet.balance).toBe(29900 + expected);
    expect(S().tourneys.length).toBe(1);
    expect(S().wallet.txs.filter((t) => t.kind === 'tourney-prize').length).toBe(expected ? 1 : 0);
    await new Promise((r2) => setTimeout(r2, 50));
    // 재시작 후에도 이중 지급 없음
    await reboot();
    expect(S().wallet.balance).toBe(29900 + expected);
    expect(S().tourneys.length).toBe(1);
    expect(S().hasSave).toBe(false);
  }, 60000);
  it('잔액이 부족하면 참가가 거부되고 통장은 불변', async () => {
    useGame.setState({ wallet: W.newWallet(0, 800) });
    S().startTournament('sng9b', 'intermediate');
    expect(S().session).toBeNull();
    expect(S().wallet.balance).toBe(800);
    expect(S().notice).toMatch(/부족/);
  });
  it('통장 데이터 변조(잔액 조작)는 감지되어 경기 시작이 막힌다', async () => {
    await saveAll({ wallet: { ...W.newWallet(), balance: 99999999 } as W.Wallet });
    await S().init();
    expect(S().walletErrors?.length).toBeGreaterThan(0);
    S().startCash('c1', 400, 'beginner');
    expect(S().session).toBeNull();
    const wl = await loadWallet();
    expect(wl.status).toBe('corrupt');
  });
});
void loadSession;
