// 카드 = 0..51 정수. rank = 2..14 (A=14), suit = 0..3 (c,d,h,s)
export type Card = number;
export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];

export const rankOf = (c: Card): number => (c % 13) + 2;
export const suitOf = (c: Card): number => Math.floor(c / 13);
export const makeCard = (rank: number, suit: number): Card => suit * 13 + (rank - 2);
export const cardToString = (c: Card): string => RANK_CHARS[rankOf(c) - 2] + SUIT_CHARS[suitOf(c)];

export function parseCard(s: string): Card {
  const r = RANK_CHARS.indexOf(s[0].toUpperCase());
  const su = SUIT_CHARS.indexOf(s[1].toLowerCase());
  if (r < 0 || su < 0 || s.length !== 2) throw new Error(`Invalid card: ${s}`);
  return su * 13 + r;
}
export const parseCards = (s: string): Card[] => s.trim().split(/\s+/).filter(Boolean).map(parseCard);

export function newDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

export function isValidCard(c: unknown): c is Card {
  return typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < 52;
}
export function hasDuplicates(cards: Card[]): boolean {
  return new Set(cards).size !== cards.length;
}
