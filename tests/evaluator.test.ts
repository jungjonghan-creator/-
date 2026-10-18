import { describe, it, expect } from 'vitest';
import { parseCards } from '../src/engine/cards';
import { evaluate, categoryOf, HandCategory } from '../src/engine/evaluator';

const ev = (s: string) => evaluate(parseCards(s));
describe('족보 평가', () => {
  it('모든 족보 등급', () => {
    expect(categoryOf(ev('As Ks Qs Js Ts 2d 3d'))).toBe(HandCategory.StraightFlush);
    expect(categoryOf(ev('9c 9d 9h 9s 2c 3d 4h'))).toBe(HandCategory.Quads);
    expect(categoryOf(ev('9c 9d 9h 2s 2c 3d 4h'))).toBe(HandCategory.FullHouse);
    expect(categoryOf(ev('2s 7s 9s Js Ks 3d 4h'))).toBe(HandCategory.Flush);
    expect(categoryOf(ev('5s 6d 7h 8c 9c Kd 2h'))).toBe(HandCategory.Straight);
    expect(categoryOf(ev('9c 9d 9h 2s 5c 7d Kh'))).toBe(HandCategory.Trips);
    expect(categoryOf(ev('9c 9d 5h 5s 2c 3d Kh'))).toBe(HandCategory.TwoPair);
    expect(categoryOf(ev('9c 9d 4h 5s 2c Jd Kh'))).toBe(HandCategory.Pair);
    expect(categoryOf(ev('9c 3d 4h 5s 2c Jd Kh'))).toBe(HandCategory.HighCard);
  });
  it('휠(A-5) 스트레이트는 6-하이 스트레이트보다 약하다', () => {
    expect(categoryOf(ev('Ac 2d 3h 4s 5c 9d Kh'))).toBe(HandCategory.Straight);
    expect(ev('Ac 2d 3h 4s 5c 9d Kh')).toBeLessThan(ev('2c 3d 4h 5s 6c 9d Kh'));
  });
  it('A-high 스트레이트는 K-high 보다 강하고 K→A 래핑(QKA23)은 스트레이트가 아니다', () => {
    expect(ev('Tc Jd Qh Ks Ac 2d 3h')).toBeGreaterThan(ev('9c Td Jh Qs Kc 2d 3h'));
    expect(categoryOf(ev('Qc Kd Ah 2s 3c 7d 9h'))).toBe(HandCategory.HighCard);
  });
  it('스트레이트 플러시 휠과 로열', () => {
    expect(categoryOf(ev('Ac 2c 3c 4c 5c Kd Kh'))).toBe(HandCategory.StraightFlush);
    expect(ev('Ac Kc Qc Jc Tc 2d 3h')).toBeGreaterThan(ev('9c Kc Qc Jc Tc 2d 3h'));
  });
  it('플러시 비교는 상위 5장 순서대로', () => {
    expect(ev('Ac Kc 9c 5c 3c 2d 2h')).toBeGreaterThan(ev('Ac Kc 9c 5c 2c 3d 3h'));
    // 6장 같은 무늬여도 상위 5장만
    expect(ev('Ac Kc 9c 5c 3c 2c 8d')).toBe(ev('Ac Kc 9c 5c 3c 4d 8d'));
  });
  it('풀하우스: 트립스 우선, 두 트립스 시 높은 쪽이 3장', () => {
    expect(ev('Kc Kd Kh 2s 2c 3d 4h')).toBeGreaterThan(ev('Qc Qd Qh As Ac 3d 4h'));
    expect(ev('Kc Kd Kh 2s 2c 2d 4h')).toBe(ev('Kc Kd Kh 2s 2c 9d 8h'));
  });
  it('키커 비교와 보드 플레이', () => {
    expect(ev('Ac Ad 9h 5s 3c 2d Kh')).toBeGreaterThan(ev('Ac Ad 9h 5s 3c 2d Qh'));
    // 보드가 로열: 어떤 홀카드든 동일
    const board = 'Ac Kc Qc Jc Tc';
    expect(ev(board + ' 2d 3h')).toBe(ev(board + ' 4d 5h'));
  });
  it('투페어에서 3번째 페어는 키커', () => {
    expect(ev('Ac Ad Kh Ks 2c 2d 3h')).toBeLessThan(ev('Ac Ad Kh Ks 5c 4d 3h'));
    expect(ev('Ac Ad Kh Ks Qc Qd 3h')).toBe(ev('Ac Ad Kh Ks Qc 4d 5h'));
  });
});
