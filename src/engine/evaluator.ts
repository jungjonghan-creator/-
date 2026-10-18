import { Card, rankOf, suitOf } from './cards';

export const enum HandCategory {
  HighCard = 0, Pair, TwoPair, Trips, Straight, Flush, FullHouse, Quads, StraightFlush,
}
export const CATEGORY_NAMES = ['하이카드', '원페어', '투페어', '트립스', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];

/** 5~7장 평가. 값이 클수록 강함. score = cat<<20 | 5개의 4비트 키커 */
export function evaluate(cards: readonly Card[]): number {
  const rc = new Array(15).fill(0);
  const sc = [0, 0, 0, 0];
  const sMask = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = rankOf(c), s = suitOf(c);
    rc[r]++; sc[s]++; sMask[s] |= 1 << r; mask |= 1 << r;
  }
  const straightHigh = (m: number): number => {
    if (m & (1 << 14)) m |= 1 << 1;
    for (let h = 14; h >= 5; h--) {
      const need = 0b11111 << (h - 4);
      if ((m & need) === need) return h;
    }
    return 0;
  };
  const pack = (cat: number, ks: number[]) => {
    let v = cat;
    for (let i = 0; i < 5; i++) v = (v << 4) | (ks[i] ?? 0);
    return v;
  };
  const top = (m: number, n: number): number[] => {
    const out: number[] = [];
    for (let r = 14; r >= 2 && out.length < n; r--) if (m & (1 << r)) out.push(r);
    return out;
  };

  const fs = sc.findIndex((n) => n >= 5);
  if (fs >= 0) {
    const sh = straightHigh(sMask[fs]);
    if (sh) return pack(HandCategory.StraightFlush, [sh]);
  }
  const quads: number[] = [], trips: number[] = [], pairs: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (rc[r] === 4) quads.push(r);
    else if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
  }
  if (quads.length) {
    const rest = top(mask & ~(1 << quads[0]), 1);
    return pack(HandCategory.Quads, [quads[0], rest[0]]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pair = trips.length > 1 ? Math.max(trips[1], pairs[0] ?? 0) : pairs[0];
    return pack(HandCategory.FullHouse, [trips[0], pair]);
  }
  if (fs >= 0) return pack(HandCategory.Flush, top(sMask[fs], 5));
  const sh = straightHigh(mask);
  if (sh) return pack(HandCategory.Straight, [sh]);
  if (trips.length) {
    return pack(HandCategory.Trips, [trips[0], ...top(mask & ~(1 << trips[0]), 2)]);
  }
  if (pairs.length >= 2) {
    const kick = top(mask & ~(1 << pairs[0]) & ~(1 << pairs[1]), 1);
    return pack(HandCategory.TwoPair, [pairs[0], pairs[1], kick[0]]);
  }
  if (pairs.length === 1) {
    return pack(HandCategory.Pair, [pairs[0], ...top(mask & ~(1 << pairs[0]), 3)]);
  }
  return pack(HandCategory.HighCard, top(mask, 5));
}

export const categoryOf = (score: number): HandCategory => (score >>> 20) as HandCategory;
export const describe = (score: number): string => CATEGORY_NAMES[categoryOf(score)];
