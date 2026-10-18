import { Card, RANK_CHARS, rankOf, suitOf } from '../engine/cards';
/** 홀카드 → 169 클래스 키 ("AKs", "QQ", "72o") */
export function handKey(a: Card, b: Card): string {
  let ra = rankOf(a), rb = rankOf(b);
  if (ra < rb) [ra, rb] = [rb, ra];
  const hi = RANK_CHARS[ra - 2], lo = RANK_CHARS[rb - 2];
  if (ra === rb) return hi + lo;
  return hi + lo + (suitOf(a) === suitOf(b) ? 's' : 'o');
}
