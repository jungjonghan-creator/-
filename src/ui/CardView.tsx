import { Card, RANK_CHARS, rankOf, suitOf, SUIT_SYMBOLS } from '../engine/cards';

const label = (c: Card) => (RANK_CHARS[rankOf(c) - 2] === 'T' ? '10' : RANK_CHARS[rankOf(c) - 2]);

export function CardView({ card, size = 'md', hidden = false, delayMs = 0, dim = false }: { card?: Card; size?: 'xs' | 'sm' | 'md' | 'lg'; hidden?: boolean; delayMs?: number; dim?: boolean }) {
  const dims = { xs: 'w-6 h-9 text-[11px]', sm: 'w-8 h-12 text-sm', md: 'w-11 h-16 text-lg', lg: 'w-14 h-20 text-2xl' }[size];
  if (card === undefined || hidden) return <div className={`card back ${dims}`} aria-label="뒷면 카드" data-testid="card-back" style={{ animationDelay: `${delayMs}ms` }} />;
  const red = suitOf(card) === 1 || suitOf(card) === 2;
  return (
    <div className={`card deal ${red ? 'red' : ''} ${dims} flex flex-col items-center justify-center ${dim ? 'opacity-50' : ''}`} data-testid="card" data-card={card} aria-label={`${label(card)}${SUIT_SYMBOLS[suitOf(card)]}`} style={{ animationDelay: `${delayMs}ms` }}>
      <span>{label(card)}</span>
      <span className="-mt-0.5">{SUIT_SYMBOLS[suitOf(card)]}</span>
    </div>
  );
}
