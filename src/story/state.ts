import { CHAPTERS, Chapter, START_BANKROLL } from './chapters';

export interface JournalEntry {
  date: number; chapter: number; hands: number; net: number; buyIn: number; cashOut: number;
  headline: string; best?: string; worst?: string;
}
export interface StoryState {
  version: 1;
  chapter: number;                // 현재 진행 중인 챕터 id
  unlocked: number;               // 해금된 최대 챕터 id
  cleared: number[];
  bankroll: number;               // 테이블 밖 자본
  debt: number;                   // 스폰서에게 진 빚
  handsInChapter: Record<number, number>;
  seated: { chapter: number; buyIn: number } | null;
  journal: JournalEntry[];
  lastSummary: JournalEntry | null;
  chapterJustCleared: number | null;
  loans: number;
}

export const newStory = (): StoryState => ({
  version: 1, chapter: 1, unlocked: 1, cleared: [], bankroll: START_BANKROLL, debt: 0, handsInChapter: {}, seated: null, journal: [], lastSummary: null, chapterJustCleared: null, loans: 0,
});

export const chapterOf = (id: number): Chapter => CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0];
export const netWorth = (s: StoryState, tableStack = 0) => s.bankroll + tableStack - s.debt;

export function canSit(s: StoryState, ch: Chapter, bbs: number): boolean {
  return !s.seated && s.bankroll >= bbs * ch.bb;
}
export const minBuyIn = (ch: Chapter) => Math.min(...ch.buyInBBs) * ch.bb;

/** 자본이 최소 바이인에도 못 미칠 때 스폰서가 빚으로 바이인을 대 준다 */
export function takeLoan(s: StoryState, ch: Chapter): StoryState {
  const amount = ch.buyInBBs[ch.buyInBBs.length - 1] * ch.bb;
  return { ...s, bankroll: s.bankroll + amount, debt: s.debt + amount, loans: s.loans + 1 };
}
export const needsLoan = (s: StoryState, ch: Chapter) => !s.seated && s.bankroll < minBuyIn(ch);

export function sit(s: StoryState, ch: Chapter, bbs: number): StoryState {
  if (!canSit(s, ch, bbs)) throw new Error('자본이 부족합니다');
  return { ...s, bankroll: s.bankroll - bbs * ch.bb, seated: { chapter: ch.id, buyIn: bbs * ch.bb } };
}
/** 테이블에서 추가 칩을 꺼낸다 (리바이/탑업) */
export function topUp(s: StoryState, amount: number): StoryState {
  if (!s.seated) throw new Error('착석 상태가 아닙니다');
  if (amount > s.bankroll) throw new Error('자본이 부족합니다');
  return { ...s, bankroll: s.bankroll - amount, seated: { ...s.seated, buyIn: s.seated.buyIn + amount } };
}

export function leave(s: StoryState, stack: number, hands: number, headline: string, best?: string, worst?: string, now = Date.now()): StoryState {
  if (!s.seated) return s;
  const ch = chapterOf(s.seated.chapter);
  const bankroll = s.bankroll + stack;
  // 빚은 이익에서 자동 상환
  const repay = Math.min(s.debt, Math.max(0, bankroll - minBuyIn(ch)) );
  const entry: JournalEntry = { date: now, chapter: ch.id, hands, net: stack - s.seated.buyIn, buyIn: s.seated.buyIn, cashOut: stack, headline, best, worst };
  const handsIn = { ...s.handsInChapter, [ch.id]: (s.handsInChapter[ch.id] ?? 0) + hands };
  let next: StoryState = { ...s, bankroll: bankroll - repay, debt: s.debt - repay, seated: null, journal: [entry, ...s.journal].slice(0, 60), lastSummary: entry, handsInChapter: handsIn, chapterJustCleared: null };
  if (!next.cleared.includes(ch.id) && netWorth(next) >= ch.goalNetWorth && (handsIn[ch.id] ?? 0) >= ch.minHands) {
    next = { ...next, cleared: [...next.cleared, ch.id], unlocked: Math.max(next.unlocked, Math.min(CHAPTERS.length, ch.id + 1)), chapterJustCleared: ch.id, chapter: Math.min(CHAPTERS.length, ch.id + 1) };
  }
  return next;
}
