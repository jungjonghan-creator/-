import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as W from '../src/economy/wallet';

const T = { id: 'mid', name: '중급 SNG', buyIn: 1000, fee: 100 };
const lim = { min: 400, max: 1000 };

describe('통장: 캐시게임 돈 흐름', () => {
  it('30,000 → 바이인 3,000 → 칩 5,200 으로 퇴장 → 32,200 (명세 예시)', () => {
    let w = W.newWallet(0);
    expect(w.balance).toBe(30000);
    w = W.openCash(w, 's1', '중급 캐시', 3000, { min: 2000, max: 5000 });
    expect(w.balance).toBe(27000);
    expect(W.atTable(w)).toBe(3000);
    w = W.closeCash(w, 's1', 5200);
    expect(w.balance).toBe(32200);
    expect(W.summarize(w).cashNet).toBe(2200);
    expect(W.atTable(w)).toBe(0);
    expect(W.verifyWallet(w)).toEqual([]);
  });
  it('손실은 그대로 줄어든다 / 전부 잃으면 반환 0', () => {
    let w = W.openCash(W.newWallet(0), 's1', '초급', 1000, lim);
    w = W.closeCash(w, 's1', 0);
    expect(w.balance).toBe(29000);
    expect(W.summarize(w).cashNet).toBe(-1000);
  });
  it('바이인 범위 밖/잔액 초과는 거부, 잔액은 음수가 되지 않는다', () => {
    const w = W.newWallet(0, 500);
    expect(() => W.openCash(w, 'a', 'x', 300, lim)).toThrow(/사이/);
    expect(() => W.openCash(w, 'a', 'x', 1100, lim)).toThrow(/사이/);
    expect(() => W.openCash(w, 'a', 'x', 1000, lim)).toThrow(W.InsufficientFunds);
    expect(w.balance).toBe(500);
  });
  it('같은 세션을 두 번 열거나 두 번 닫아도 한 번만 처리 (멱등)', () => {
    let w = W.newWallet(0);
    w = W.openCash(w, 's', 'x', 1000, lim); const w2 = W.openCash(w, 's', 'x', 1000, lim);
    expect(w2.balance).toBe(29000);
    let c = W.closeCash(w2, 's', 1500); c = W.closeCash(c, 's', 1500);
    expect(c.balance).toBe(30500);
    expect(c.txs.filter((t) => t.kind === 'cash-cashout').length).toBe(1);
  });
  it('탑업은 opId 로 멱등이고 최대 바이인을 넘지 못한다', () => {
    let w = W.openCash(W.newWallet(0), 's', 'x', 500, lim);
    w = W.cashTopUp(w, 's', 'h12', 300, { max: 1000, currentChips: 500 });
    const again = W.cashTopUp(w, 's', 'h12', 300, { max: 1000, currentChips: 800 });
    expect(again.balance).toBe(w.balance);
    expect(() => W.cashTopUp(w, 's', 'h13', 300, { max: 1000, currentChips: 800 })).toThrow(/최대/);
  });
});

describe('통장: 토너먼트', () => {
  it('참가비+수수료 차감, 상금 한 번만 지급', () => {
    let w = W.enterTournament(W.newWallet(0), 't1', T);
    expect(w.balance).toBe(30000 - 1100);
    w = W.payPrize(w, 't1', 5400, 1, 9);
    w = W.payPrize(w, 't1', 5400, 1, 9); // 두 번째는 무시
    expect(w.balance).toBe(30000 - 1100 + 5400);
    expect(w.txs.filter((t) => t.kind === 'tourney-prize').length).toBe(1);
    const s = W.summarize(w);
    expect(s.tourneyNet).toBe(4300); expect(s.wins).toBe(1); expect(s.itm).toBe(1);
    expect(s.roi).toBeCloseTo(4300 / 1100, 6);
  });
  it('중복 등록은 한 번만 차감, 잔액 부족이면 등록 불가(마이너스 없음)', () => {
    let w = W.enterTournament(W.newWallet(0), 't1', T);
    const dup = W.enterTournament(w, 't1', T);
    expect(dup.balance).toBe(w.balance);
    const poor = W.newWallet(0, 1000);
    expect(() => W.enterTournament(poor, 't2', T)).toThrow(W.InsufficientFunds);
    expect(poor.balance).toBe(1000);
  });
  it('재진입은 새 참가비, 상금 없이 탈락하면 손실 기록', () => {
    let w = W.enterTournament(W.newWallet(0), 't1', T);
    w = W.reenterTournament(w, 't1', T, 2);
    w = W.reenterTournament(w, 't1', T, 2);
    expect(w.balance).toBe(30000 - 2200);
    w = W.payPrize(w, 't1', 0, 40, 100);
    expect(W.summarize(w).tourneyNet).toBe(-2200);
    expect(W.summarize(w).itm).toBe(0);
  });
  it('프리롤은 무료 참가, 소액 상금만 지급, 연습게임은 통장에 영향 없음', () => {
    let w = W.enterTournament(W.newWallet(0), 'f1', { id: 'free', name: '프리롤', buyIn: 0, fee: 0 }, 'freeroll');
    expect(w.balance).toBe(30000);
    w = W.payPrize(w, 'f1', 200, 1, 9);
    expect(w.balance).toBe(30200);
    let p = W.openPractice(w, 'p1', '연습'); p = W.closePractice(p, 'p1');
    expect(p.balance).toBe(w.balance);
    expect(W.verifyWallet(p)).toEqual([]);
  });
  it('몰수(forfeit): 사라진 세션의 열린 계정은 환불 없이 종료', () => {
    let w = W.openCash(W.newWallet(0), 's', 'x', 1000, lim);
    w = W.forfeit(w, 's');
    expect(w.balance).toBe(29000);
    expect(W.atTable(w)).toBe(0);
    expect(() => W.closeCash(w, 'zzz', 5)).toThrow();
  });
});

describe('통장: 무결성 (속성 기반)', () => {
  it('임의의 거래 순서에서도 잔액 = 초기 + Σ원장, 음수 없음, id 유일', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 6000 })), { minLength: 1, maxLength: 60 }), (ops) => {
      let w = W.newWallet(0, 20000); let n = 0;
      for (const [op, amt] of ops) {
        const sid = 's' + (n++ % 7);
        try {
          if (op === 0) w = W.openCash(w, sid, 'c', Math.max(400, Math.min(1000, amt)), lim);
          else if (op === 1) w = W.closeCash(w, sid, amt % 4000);
          else if (op === 2) w = W.enterTournament(w, sid, T);
          else if (op === 3) w = W.payPrize(w, sid, amt, 1 + (amt % 9), 9);
          else if (op === 4) w = W.cashTopUp(w, sid, 'o' + amt, 200, { max: 100000, currentChips: 0 });
          else w = W.reenterTournament(w, sid, T, 2 + (amt % 3));
        } catch { /* 거부된 거래는 상태를 바꾸지 않아야 한다 */ }
        if (w.balance < 0) return false;
      }
      return W.verifyWallet(w).length === 0;
    }), { numRuns: 300 });
  });
});
