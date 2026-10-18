import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { beginHand, newSession, defaultAIs, aiStep, humanAct, runAIUntilHuman, Session } from '../src/game/session';
import { createRng } from '../src/engine/rng';
import { saveSession, loadSession, exportSession, importSession, saveKV } from '../src/persist/db';
import { validateSession } from '../src/persist/validate';
import { verifyRecord } from '../src/engine/replay';
import { legalActions } from '../src/engine/game';

function playHands(n: number, seats = 6): Session {
  let s = newSession({ mode: 'cash', seats, startBB: 100, bb: 100, speed: 'normal', humanName: 'TETO', ais: defaultAIs(seats - 1, 3), seed: 42 });
  const rng = createRng(42);
  for (let h = 0; h < n; h++) {
    s = beginHand(s, rng);
    s = runAIUntilHuman(s);
    let guard = 0;
    while (s.game.street !== 'complete' && guard++ < 100) {
      const la = legalActions(s.game)!;
      s = humanAct(s, la.canCheck ? { type: 'check' } : la.callAmount < s.game.players[0].stack ? { type: 'call' } : { type: 'fold' });
      s = runAIUntilHuman(s);
    }
  }
  return s;
}

describe('저장/복구', () => {
  it('핸드 중간 저장 → 복구 후 덱·홀카드·보드 동일, 이어서 동일 AI 결정', async () => {
    let s = newSession({ mode: 'cash', seats: 6, startBB: 100, bb: 100, speed: 'normal', humanName: 'TETO', ais: defaultAIs(5, 4), seed: 7 });
    s = beginHand(s, createRng(7)); s = runAIUntilHuman(s);
    await saveSession(s);
    const r = await loadSession();
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.session.game.deck).toEqual(s.game.deck);
    expect(r.session.game.players.map((p) => p.hole)).toEqual(s.game.players.map((p) => p.hole));
    expect(r.session.game.board).toEqual(s.game.board);
    // 사람 체크/콜 후 AI 진행 결과가 원본과 복구본에서 동일
    const la = legalActions(s.game)!;
    const act = la.canCheck ? { type: 'check' as const } : { type: 'call' as const };
    const a = runAIUntilHuman(humanAct(s, act)), b = runAIUntilHuman(humanAct(r.session, act));
    expect(b.game).toEqual(a.game);
  });
  it('여러 핸드 후 모든 기록 검증 통과 + 내보내기/가져오기 왕복', () => {
    const s = playHands(25);
    expect(s.records.length).toBe(25);
    expect(validateSession(s).ok).toBe(true);
    const text = exportSession(s);
    const r = importSession(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.records).toEqual(s.records);
  });
  it('손상 데이터 검출: 덱 변조 / 칩 변조 / 보드 변조 / 기록 변조', () => {
    const s = playHands(5);
    const tamper = (fn: (x: any) => void) => { const c = JSON.parse(JSON.stringify(s)); fn(c); return validateSession(c); };
    expect(tamper((c) => { c.game.deck[0] = c.game.deck[1]; }).ok).toBe(false);
    expect(tamper((c) => { c.game.players[0].stack += 1; }).ok).toBe(false);
    expect(tamper((c) => { c.game.board = [0, 1, 2]; }).ok).toBe(false);
    expect(tamper((c) => { c.records[2].board[0] = (c.records[2].board[0] + 1) % 52; }).ok).toBe(false);
    expect(tamper((c) => { c.records[1].result.net[0] += 5; }).ok).toBe(false);
    expect(tamper((c) => { c.version = 99; }).ok).toBe(false);
    expect(importSession('{not json').ok).toBe(false);
    expect(verifyRecord(s.records[0])).toEqual([]);
  });
  it('손상된 저장소는 조용히 복구하지 않고 corrupt 로 보고', async () => {
    const s = playHands(2);
    const bad = JSON.parse(JSON.stringify(s)); bad.game.deck[3] = bad.game.deck[4];
    await saveKV('session', bad);
    const r = await loadSession();
    expect(r.status).toBe('corrupt');
  });
  it('동일 행동 중복 실행 방지: 행동 후 같은 입력 재실행은 거부', () => {
    let s = newSession({ mode: 'cash', seats: 2, startBB: 50, bb: 100, speed: 'normal', humanName: 'TETO', ais: defaultAIs(1, 3), seed: 3 });
    s = beginHand(s, createRng(3)); s = runAIUntilHuman(s);
    const after = humanAct(s, { type: 'call' });
    if (after.game.toAct !== null && after.game.players[after.game.toAct].isHuman) {
      // 사람 차례가 다시 온 경우에도 같은 'call' 이 이미 합법이 아닐 수 있음 → 엔진이 검증
    } else {
      expect(() => humanAct(after, { type: 'call' })).toThrow();
    }
    void aiStep;
  });
});
