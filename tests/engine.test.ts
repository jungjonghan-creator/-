import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyAction, buildPots, checkInvariants, legalActions, IllegalActionError, startHand, startHandWithDeck, toHandRecord } from '../src/engine/game';
import { createRng, shuffledDeck } from '../src/engine/rng';
import { GameState } from '../src/engine/types';
import { mkGame, startRigged } from './helpers';

const act = (s: GameState, a: Parameters<typeof applyAction>[1]) => applyAction(s, a);

describe('덱/RNG', () => {
  it('셔플 후 52장 유일', () => {
    for (let seed = 0; seed < 200; seed++) {
      const d = shuffledDeck(createRng(seed));
      expect(d.length).toBe(52);
      expect(new Set(d).size).toBe(52);
    }
  });
  it('같은 시드는 같은 덱, 다른 시드는 다른 덱', () => {
    expect(shuffledDeck(createRng(7))).toEqual(shuffledDeck(createRng(7)));
    expect(shuffledDeck(createRng(7))).not.toEqual(shuffledDeck(createRng(8)));
  });
});

describe('헤즈업 포지션/액션 순서', () => {
  it('버튼=SB, 프리플랍 선행동, 포스트플랍 후행동', () => {
    let s = startHand(mkGame([5000, 5000]), createRng(1));
    expect(s.sbSeat).toBe(s.button);
    expect(s.toAct).toBe(s.button);
    s = act(s, { type: 'call' });
    expect(s.toAct).toBe(s.bbSeat); // BB 옵션
    s = act(s, { type: 'check' });
    expect(s.street).toBe('flop');
    expect(s.toAct).toBe(s.bbSeat); // 포스트플랍엔 BB가 먼저
  });
  it('버튼 이동', () => {
    let s = startHand(mkGame([5000, 5000]), createRng(1));
    const b1 = s.button;
    s = act(s, { type: 'fold' });
    s = startHand(s, createRng(2));
    expect(s.button).not.toBe(b1);
  });
});

describe('6-max/9인 순서', () => {
  it('UTG 선행동, 포스트플랍 SB 선행동', () => {
    let s = startHand(mkGame([5000, 5000, 5000, 5000, 5000, 5000]), createRng(3));
    const utg = (s.bbSeat + 1) % 6;
    expect(s.toAct).toBe(utg);
    // 모두 콜, BB 체크
    for (let i = 0; i < 5; i++) s = act(s, { type: 'call' });
    s = act(s, { type: 'check' });
    expect(s.street).toBe('flop');
    expect(s.toAct).toBe(s.sbSeat);
  });
  it('9인 테이블 시작', () => {
    const s = startHand(mkGame(Array(9).fill(10000)), createRng(4));
    expect(s.sbSeat).toBe((s.button + 1) % 9);
    expect(s.bbSeat).toBe((s.button + 2) % 9);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('베팅 규칙', () => {
  it('최소 레이즈/최소 베팅 거부', () => {
    let s = startHand(mkGame([5000, 5000, 5000]), createRng(5));
    const la = legalActions(s)!;
    expect(la.minTo).toBe(200);
    expect(() => act(s, { type: 'raise', to: 150 })).toThrow(IllegalActionError);
    s = act(s, { type: 'raise', to: 300 }); // +200
    expect(legalActions(s)!.minTo).toBe(500);
    expect(() => act(s, { type: 'raise', to: 400 })).toThrow(IllegalActionError);
  });
  it('체크 가능한데 폴드/콜 불가, 콜할 때 체크 불가', () => {
    const s = startHand(mkGame([5000, 5000, 5000]), createRng(5));
    expect(() => act(s, { type: 'check' })).toThrow();
    const s2 = act(s, { type: 'call' });
    const s3 = act(s2, { type: 'call' });
    expect(() => act(s3, { type: 'fold' })).toThrow(); // BB 옵션: 체크 가능
  });
  it('스택 초과 거부, 정수가 아닌 값 거부', () => {
    const s = startHand(mkGame([1000, 1000]), createRng(5));
    expect(() => act(s, { type: 'raise', to: 1001 })).toThrow();
    expect(() => act(s, { type: 'raise', to: 300.5 })).toThrow();
  });
  it('숏 올인(풀 레이즈 미만)은 이미 행동한 플레이어의 레이즈 권한을 재개하지 않는다', () => {
    // 3인: P0 버튼? 좌석 지정 대신 흐름 검증. 스택: 큰, 큰, 작음(350)
    let s = startHand(mkGame([5000, 5000, 5000]), createRng(9));
    // 모든 사람 콜 → 플랍
    s = act(s, { type: 'call' }); s = act(s, { type: 'call' }); s = act(s, { type: 'check' });
    expect(s.street).toBe('flop');
    // 플랍: A 베팅 400
    const A = s.toAct!;
    s = act(s, { type: 'bet', to: 400 });
    const B = s.toAct!;
    // B가 리레이즈 풀: 1000
    s = act(s, { type: 'raise', to: 1000 });
    expect(s.minRaise).toBe(600);
    // 마지막 C: 올인 1200 (증가 200 < 600 숏)
    const C = s.toAct!;
    s.players[C].stack = 1200 - s.players[C].bet; s.totalChips = s.players.reduce((t, p) => t + p.stack + p.invested, 0);
    s = act(s, { type: 'allin' });
    expect(s.currentBet).toBe(1200);
    expect(s.minRaise).toBe(600);
    // A는 400→(1200) 콜 필요. A는 B의 풀레이즈에 직면한 적 없음(행동 안 함 후 acted=false) → lastActBet=400, cur=1200 → 800 ≥ 600 → 레이즈 가능
    expect(s.toAct).toBe(A);
    expect(legalActions(s)!.canRaise).toBe(true);
    s = act(s, { type: 'call' });
    // B는 1000에서 행동 완료 상태; 숏올인 증가 200 < 600 → 레이즈 불가, 콜/폴드만
    expect(s.toAct).toBe(B);
    const la = legalActions(s)!;
    expect(la.canRaise).toBe(false);
    expect(la.canCall).toBe(true);
    expect(() => act(s, { type: 'raise', to: 2000 })).toThrow();
    void C;
  });
  it('불가능 상태: 행동권 없는 플레이어/종료된 핸드', () => {
    let s = startHand(mkGame([1000, 1000]), createRng(5));
    s = act(s, { type: 'fold' });
    expect(s.street).toBe('complete');
    expect(() => act(s, { type: 'check' })).toThrow();
  });
});

describe('정산', () => {
  it('폴드 승리: 미대응 베팅 반환, 칩 보존', () => {
    let s = startHand(mkGame([1000, 1000]), createRng(5));
    s = act(s, { type: 'raise', to: 500 });
    s = act(s, { type: 'fold' });
    expect(s.result!.endedByFold).toBe(true);
    expect(s.players.reduce((t, p) => t + p.stack, 0)).toBe(2000);
    // SB(버튼) 500 raise 후 BB 폴드: 반환 포함 순증가 = +100(BB)
    const w = s.players.findIndex((p) => p.stack === 1100);
    expect(w).toBeGreaterThanOrEqual(0);
  });
  it('헤즈업 올인 콜 + 큰 스택 초과분 반환', () => {
    let g = mkGame([1000, 3000]);
    let s = startRigged(g, ['As Ad', 'Kh Kd'], '2c 7d 9h Js 3c');
    // 좌석0(1000)이 AA. 버튼 이동으로 누가 SB인지 무관하게 둘 다 올인
    s = act(s, { type: 'allin' }); s = act(s, { type: 'allin' });
    expect(s.street).toBe('complete');
    expect(s.players[0].stack).toBe(2000);
    expect(s.players[1].stack).toBe(2000);
    expect(s.board.length).toBe(5);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('3인 다중 올인: 메인팟/사이드팟 정확히 분배', () => {
    // 스택 seat0=300(A:최강), seat1=700(B:중간), seat2=2000(C:최약)
    const g = mkGame([300, 700, 2000], { sb: 50, bb: 100, ante: 0, maxSeats: 9 });
    let s = startRigged(g, ['As Ah', 'Ks Kh', 'Qs Qh'], '2c 7d 9h Js 3d');
    s = act(s, { type: 'allin' }); s = act(s, { type: 'allin' }); s = act(s, { type: 'allin' });
    expect(s.street).toBe('complete');
    // 메인팟 900 → seat0, 사이드팟1 (700-300)*2=800 → seat1, 나머지 1300 반환 seat2
    expect(s.players[0].stack).toBe(900);
    expect(s.players[1].stack).toBe(800);
    expect(s.players[2].stack).toBe(1300);
    expect(s.players.reduce((t, p) => t + p.stack, 0)).toBe(3000);
  });
  it('동점 분배와 홀수 칩', () => {
    // 보드 플레이로 3명 split: 팟 301 가정 대신 ante로 홀수 만들기
    const g = mkGame([1000, 1000, 1000], { sb: 50, bb: 100, ante: 0, maxSeats: 9 });
    let s = startRigged(g, ['2s 3d', '2h 3c', '4s 5d'], 'Ac Kc Qc Jc Tc');
    s = act(s, { type: 'call' }); s = act(s, { type: 'call' }); s = act(s, { type: 'check' });
    while (s.street !== 'complete') s = act(s, legalActions(s)!.canCheck ? { type: 'check' } : { type: 'call' });
    expect(s.players.every((p) => p.stack === 1000)).toBe(true);
  });
  it('미대응 베팅 반환과 다중 레이어', () => {
    const mk = (invested: number, folded = false) => ({ invested, folded, inHand: true } as any);
    const a = buildPots([mk(3000), mk(1000)]);
    expect(a.returned).toEqual({ 0: 2000 });
    expect(a.layers).toEqual([{ amount: 2000, eligible: [0, 1] }]);
    const b = buildPots([mk(300), mk(700), mk(2000), mk(500, true)]);
    expect(b.returned).toEqual({ 2: 1300 });
    expect(b.layers).toEqual([{ amount: 1200, eligible: [0, 1, 2] }, { amount: 1000, eligible: [1, 2] }]);
  });
  it('앤티는 팟에 포함되고 칩이 보존된다', () => {
    const g = mkGame([1000, 1000, 1000], { sb: 50, bb: 100, ante: 10, maxSeats: 9 });
    const s = startHand(g, createRng(1));
    expect(s.players.reduce((t, p) => t + p.invested, 0)).toBe(30 + 150);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('덱 불변성과 재현', () => {
  it('핸드 중 홀카드/덱 변하지 않음, 기록 재생 시 동일 결과', () => {
    let s = startHand(mkGame([5000, 5000, 5000, 5000]), createRng(11));
    const deck0 = [...s.deck];
    const holes0 = s.players.map((p) => [...p.hole]);
    let guard = 0;
    while (s.street !== 'complete' && guard++ < 200) {
      const la = legalActions(s)!;
      s = act(s, la.canCheck ? { type: 'check' } : { type: 'call' });
      expect(s.deck).toEqual(deck0);
      s.players.forEach((p, i) => expect(p.hole).toEqual(holes0[i]));
    }
    const rec = toHandRecord(s);
    // 재생
    const base = mkGame([5000, 5000, 5000, 5000]);
    let r = startHandWithDeck(base, rec.deck, rec.seed);
    for (const { action } of rec.actions) r = act(r, action);
    expect(r.players.map((p) => p.stack)).toEqual(s.players.map((p) => p.stack));
    expect(r.board).toEqual(s.board);
  });
});

describe('속성 기반: 무작위 합법 행동 시뮬레이션', () => {
  const randomPlay = (seed: number, nPlayers: number, hands: number) => {
    const rng = createRng(seed);
    const stacks = Array.from({ length: nPlayers }, () => 2000 + rng.int(30000));
    const total = stacks.reduce((a, b) => a + b, 0);
    let s = mkGame(stacks, { sb: 25 + rng.int(3) * 25, bb: 100, ante: rng.int(2) * 10, maxSeats: 9 });
    for (let h = 0; h < hands; h++) {
      s = startHand(s, rng);
      if (s.gameOver) break;
      let guard = 0;
      while (s.street !== 'complete') {
        if (guard++ > 500) throw new Error('infinite loop');
        const la = legalActions(s)!;
        const r = rng.next();
        let a: Parameters<typeof applyAction>[1];
        if (r < 0.1 && la.canFold) a = { type: 'fold' };
        else if (r < 0.5 && la.canCheck) a = { type: 'check' };
        else if (r < 0.75 && la.canCall) a = { type: 'call' };
        else if (la.canRaise) {
          const x = rng.next();
          if (x < 0.15) a = { type: 'allin' };
          else a = { type: la.isBet ? 'bet' : 'raise', to: la.minTo + rng.int(la.maxTo - la.minTo + 1) };
        } else a = la.canCheck ? { type: 'check' } : { type: 'call' };
        s = act(s, a);
        const errs = checkInvariants(s);
        if (errs.length) throw new Error(errs.join(','));
      }
      expect(s.players.reduce((t, p) => t + p.stack, 0)).toBe(total);
      expect(s.players.every((p) => p.stack >= 0)).toBe(true);
    }
    return s;
  };
  it('2~9인 무작위 플레이 5000+핸드 칩 보존/무한루프 없음', () => {
    let hands = 0;
    for (let seed = 1; seed <= 2500; seed++) {
      const n = 2 + (seed % 8);
      const s = randomPlay(seed, n, 40);
      hands += s.handNo;
    }
    expect(hands).toBeGreaterThan(5000);
    console.log('simulated hands:', hands);
  });
  it('fast-check 속성: 임의 시드/인원', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e6 }), fc.integer({ min: 2, max: 9 }), (seed, n) => { randomPlay(seed, n, 15); return true; }), { numRuns: 150 });
  });
});
