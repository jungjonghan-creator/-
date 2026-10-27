import { describe, it, expect } from 'vitest';
import { cashRebuy, launchCash, launchTournament, leaveCash, reconcile, settleTournament, tournamentResult } from '../src/economy/actions';
import { CASH_TABLES, PRACTICE_TABLE, TOURNAMENTS, sngPrizeTable, tournamentById, BUYIN_RANGE_BB, prizePoolOf } from '../src/economy/catalog';
import * as W from '../src/economy/wallet';
import { aiStep, beginHand, sessionOver, Session } from '../src/game/session';
import { createRng } from '../src/engine/rng';
import { checkInvariants } from '../src/engine/game';

/** 히어로까지 AI 로 돌려 경기를 끝까지 / N 핸드 진행 */
function autoPlay(s: Session, hands: number, rng = createRng(1)): Session {
  s = { ...s, aiById: { ...(s.aiById ?? {}), hero: { profileId: 'Balanced', difficulty: 3 } } };
  for (let h = 0; h < hands; h++) {
    if (s.game.street === 'complete' && h > 0) {
      if (sessionOver(s)) break;
      s = beginHand(s, rng);
    }
    let g = 0;
    while (s.game.toAct !== null) { if (g++ > 2000) throw new Error('loop'); s = aiStep(s).sess; }
  }
  return s;
}

describe('캐시게임 테이블/블라인드', () => {
  it('테이블 정의: 명세의 SB/BB 와 40~100BB 바이인', () => {
    const t = Object.fromEntries(CASH_TABLES.map((c) => [c.id, c]));
    expect([t.c1.sb, t.c1.bb, t.c1.minBuy, t.c1.maxBuy]).toEqual([5, 10, 400, 1000]);
    expect([t.c2.sb, t.c2.bb, t.c2.minBuy, t.c2.maxBuy]).toEqual([25, 50, 2000, 5000]);
    expect([t.c3.sb, t.c3.bb, t.c3.minBuy, t.c3.maxBuy]).toEqual([100, 200, 8000, 20000]);
    expect([t.c4.sb, t.c4.bb, t.c4.minBuy, t.c4.maxBuy]).toEqual([500, 1000, 40000, 100000]);
    expect(BUYIN_RANGE_BB).toEqual({ min: 40, max: 100 });
  });
  it('[시나리오1] 캐시게임 100핸드를 진행해도 SB/BB 가 변하지 않는다', () => {
    const { session } = launchCash(W.newWallet(0), CASH_TABLES[1], 3000, 'intermediate', {}, 11, 'sid1');
    let s = session;
    const seen = new Set<string>();
    const rng = createRng(2);
    s = { ...s, aiById: { ...(s.aiById ?? {}), hero: { profileId: 'Balanced', difficulty: 3 } } };
    for (let h = 0; h < 100; h++) {
      if (h > 0) s = beginHand(s, rng);
      seen.add(`${s.game.config.sb}/${s.game.config.bb}/${s.game.config.ante}`);
      while (s.game.toAct !== null) s = aiStep(s).sess;
      // 히어로 칩이 바닥나면 테스트 편의상 보충(통장과 무관한 순수 블라인드 검증)
      const hero = s.game.players[0]; if (hero.stack < 50) { s = { ...s, game: { ...s.game, players: s.game.players.map((p, i) => (i === 0 ? { ...p, stack: 3000, busted: false } : p)), totalChips: s.game.totalChips + 3000 - hero.stack } }; }
    }
    expect([...seen]).toEqual(['25/50/0']);
  });
});

describe('[시나리오5] 캐시게임 정산', () => {
  it('바이인 → 플레이 → 퇴장: 남은 테이블 칩만 통장에 반환, 순이익 = 칩 − 바이인', () => {
    let w = W.newWallet(0);
    const l = launchCash(w, CASH_TABLES[1], 3000, 'intermediate', {}, 5, 'cash1');
    expect(l.wallet.balance).toBe(27000);
    expect(W.atTable(l.wallet)).toBe(3000);
    let s = autoPlay(l.session, 15);
    const rng = createRng(4);
    // 핸드 종료 상태로 만든 뒤 퇴장
    while (s.game.street !== 'complete') s = aiStep(s).sess;
    const chips = s.game.players[0].stack;
    expect(() => leaveCash(l.wallet, { ...s, game: { ...s.game, street: 'flop' } })).toThrow(/핸드가 끝난/);
    const after = leaveCash(l.wallet, s);
    expect(after.balance).toBe(27000 + chips);
    expect(W.summarize(after).cashNet).toBe(chips - 3000);
    // 두 번 나가도 두 번 지급되지 않는다
    expect(leaveCash(after, s).balance).toBe(after.balance);
    expect(W.verifyWallet(after)).toEqual([]);
    void rng;
  });
  it('바이인 범위 밖/잔액 부족은 거부되고 통장은 그대로 (마이너스 없음) [시나리오12]', () => {
    const w = W.newWallet(0, 1500);
    expect(() => launchCash(w, CASH_TABLES[1], 1000, 'beginner', {}, 1)).toThrow();       // 2,000 미만
    expect(() => launchCash(w, CASH_TABLES[1], 3000, 'beginner', {}, 1)).toThrow(W.InsufficientFunds);
    expect(() => launchCash(w, CASH_TABLES[0], 2000, 'beginner', {}, 1)).toThrow();       // 최대 1,000 초과
    expect(w.balance).toBe(1500);
  });
  it('리바이는 같은 핸드에서 한 번만, 최대 바이인 초과 불가', () => {
    const w0 = W.newWallet(0);
    const { session, wallet } = launchCash(w0, CASH_TABLES[0], 400, 'beginner', {}, 3, 'sx');
    let s = session; while (s.game.toAct !== null) s = aiStep({ ...s, aiById: { ...(s.aiById ?? {}), hero: { profileId: 'Balanced', difficulty: 3 } } }).sess;
    const a = cashRebuy(wallet, s, 300);
    const b = cashRebuy(a.wallet, a.session, 300); // 같은 핸드: 중복 클릭
    expect(a.wallet.balance).toBe(wallet.balance - 300);
    expect(b.wallet.balance).toBe(a.wallet.balance);
    expect(b.session.game.players[0].stack).toBe(a.session.game.players[0].stack);
    expect(() => cashRebuy(a.wallet, { ...a.session, game: { ...a.session.game, handNo: 99 } }, 600)).toThrow(/최대/);
  });
  it('연습 테이블은 통장에 영향이 없다', () => {
    const w = W.newWallet(0);
    const l = launchCash(w, PRACTICE_TABLE, 1000, 'beginner', {}, 7, 'pr1');
    expect(l.wallet.balance).toBe(30000);
    const s = autoPlay(l.session, 6); let t = s; while (t.game.street !== 'complete') t = aiStep(t).sess;
    expect(leaveCash(l.wallet, t).balance).toBe(30000);
  });
});

describe('[시나리오6·7] 토너먼트 참가비·상금 풀·중복 지급 방지', () => {
  it('9인 SNG 상금: 초급 900→540, 중급 9,000→5,400, 상급 45,000→27,000, 프로 180,000→108,000 (60/30/10)', () => {
    const exp: Record<string, [number, number]> = { sng9a: [900, 540], sng9b: [9000, 5400], sng9c: [45000, 27000], sng9d: [180000, 108000] };
    for (const [id, [pool, first]] of Object.entries(exp)) {
      const d = tournamentById(id);
      expect(prizePoolOf(d)).toBe(pool);
      const pt = sngPrizeTable(d);
      expect(pt[0]).toBe(first);
      expect(pt.reduce((a, b) => a + b, 0)).toBe(pool);
      expect(pt.length).toBe(3);
      expect(pt[1]).toBe(Math.floor(pool * 0.3));
    }
    expect(tournamentById('sng9b').fee).toBe(100);
    expect(tournamentById('sng9d').buyIn + tournamentById('sng9d').fee).toBe(22000);
  });
  it('등록: 참가비+수수료 차감, 완주 후 순위 상금 한 번만 지급, 총 수지 일치', () => {
    const def = tournamentById('sng9b');
    const l = launchTournament(W.newWallet(0), def, 'intermediate', {}, 21, { sid: 't-1' });
    expect(l.wallet.balance).toBe(30000 - 1100);
    let s = l.session;
    const rng = createRng(3);
    s = { ...s, aiById: { ...(s.aiById ?? {}), hero: { profileId: 'Balanced', difficulty: 3 } } };
    for (let i = 0; i < 400 && !sessionOver(s); i++) { if (i > 0) s = beginHand(s, rng); while (s.game.toAct !== null) s = aiStep(s).sess; }
    expect(sessionOver(s)).toBe(true);
    const r = tournamentResult(s)!;
    expect(r.field).toBe(9);
    const w1 = settleTournament(l.wallet, s);
    const w2 = settleTournament(w1, s); // 중복 호출
    const expected = [5400, 2700, 900][r.place - 1] ?? 0;
    expect(r.prize).toBe(expected);
    expect(w1.balance).toBe(30000 - 1100 + expected);
    expect(w2.balance).toBe(w1.balance);
    expect(w1.txs.filter((t) => t.kind === 'tourney-prize').length).toBe(expected ? 1 : 0);
    expect(W.verifyWallet(w1)).toEqual([]);
    expect(W.summarize(w1).tourneyNet).toBe(expected - 1100);
  });
  it('잔액이 참가비보다 적으면 참가 불가 (잔액 불변)', () => {
    const w = W.newWallet(0, 5000);
    expect(() => launchTournament(w, tournamentById('sng9c'), 'advanced', {}, 1)).toThrow(W.InsufficientFunds);
    expect(w.balance).toBe(5000);
  });
  it('프리롤은 무료, 소액 가상 상금(180/90/30)만 지급', () => {
    const def = tournamentById('free9');
    expect(sngPrizeTable(def)).toEqual([180, 90, 30]);
    const l = launchTournament(W.newWallet(0, 0), def, 'beginner', {}, 5, { sid: 'f' }); // 잔액 0 이어도 참가 가능
    expect(l.wallet.balance).toBe(0);
    expect(l.wallet.accounts['f'].kind).toBe('freeroll');
  });
  it('MTT: 참가비 차감, NPC 포함 상금 풀 = 참가비 × 총 엔트리', () => {
    const def = tournamentById('mtt27');
    const l = launchTournament(W.newWallet(0), def, 'beginner', {}, 8, { sid: 'm' });
    expect(l.wallet.balance).toBe(30000 - 550);
    expect(l.session.mtt!.prizePool).toBe(500 * 27);
    expect(l.session.mtt!.payouts.reduce((a, b) => a + b, 0)).toBe(500 * 27);
  });
});

describe('정합성 복구 (reconcile)', () => {
  it('저장된 세션이 없는 열린 계정은 몰수 — 새로고침/삭제로 손실을 되돌릴 수 없다', () => {
    const l = launchCash(W.newWallet(0), CASH_TABLES[0], 500, 'beginner', {}, 1, 'orph');
    const w = reconcile(l.wallet, null);
    expect(w.accounts['orph'].status).toBe('closed');
    expect(w.balance).toBe(29500);
    // 세션이 있으면 그대로 둔다
    expect(reconcile(l.wallet, l.session).accounts['orph'].status).toBe('open');
  });
  it('손상 복구 환불은 한 번만, 양수일 때만', () => {
    const l = launchCash(W.newWallet(0), CASH_TABLES[0], 500, 'beginner', {}, 1, 'bad');
    let w = W.refundOpen(l.wallet, 'bad');
    expect(w.balance).toBe(30000);
    w = W.refundOpen(w, 'bad');
    expect(w.balance).toBe(30000);
    expect(W.verifyWallet(w)).toEqual([]);
  });
});

describe('전체 토너먼트 목록 정의 일관성', () => {
  it('모든 대회: 참가자 수·상금·구조가 유효', () => {
    for (const d of TOURNAMENTS) {
      expect(d.entrants).toBeGreaterThanOrEqual(2);
      expect(d.buyIn).toBeGreaterThanOrEqual(0);
      if (d.kind !== 'mtt') expect(sngPrizeTable(d).reduce((a, b) => a + b, 0)).toBe(prizePoolOf(d));
      expect(['regular', 'adaptive']).toContain(d.blindMode);
    }
    expect(TOURNAMENTS.length).toBeGreaterThanOrEqual(8);
    // 캐시/토너먼트 불변식
    const l = launchCash(W.newWallet(0), CASH_TABLES[0], 500, 'beginner', {}, 1, 'z');
    expect(checkInvariants(l.session.game)).toEqual([]);
  });
});
