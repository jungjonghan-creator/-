/**
 * 상금 구조 계산 — 공식 세계 시뮬레이션, 개인 인스턴스, 서버 정산이 모두 이 한 함수를 쓴다.
 * 불변식: Σ payouts == prizePool (정수, 잔여는 우승 상금에), payouts 는 비증가, 보장 상금 오버레이는 주최 부담으로 별도 기록.
 */
import type { EventDef } from './calendar';

export interface PrizeStructure {
  entries: number;
  buyIn: number;
  fee: number;
  /** 참가자 바이인으로 모인 현금 풀 (PKO 이면 바운티 몫을 제외) */
  cashFromEntries: number;
  /** 보장 상금 때문에 주최(시스템)가 추가로 채우는 오버레이 */
  overlay: number;
  /** 순위별 상금이 나뉘는 총액 = cashFromEntries + overlay */
  prizePool: number;
  paid: number;
  payouts: number[];
  /** PKO 바운티 풀 / 엔트리당 시작 바운티 */
  bountyPool: number;
  bountyUnit: number;
  /** 새틀라이트: 발행되는 티켓 수 / 티켓 액면 / 마지막 입상자(티켓 다음 순위)가 받는 현금 */
  tickets: number;
  ticketValue: number;
  ticketCashRemainder: number;
}

export const feeOf = (buyIn: number, feePct: number) => Math.round(buyIn * feePct);
export const entryCost = (e: Pick<EventDef, 'buyIn' | 'feePct'>) => e.buyIn + feeOf(e.buyIn, e.feePct);

function weights(paid: number, a: number): number[] {
  return Array.from({ length: paid }, (_, i) => 1 / Math.pow(i + 1, a));
}
function split(pool: number, paid: number, a: number): number[] {
  const w = weights(paid, a);
  const sum = w.reduce((x, y) => x + y, 0);
  const p = w.map((x) => Math.floor((x / sum) * pool));
  p[0] += pool - p.reduce((x, y) => x + y, 0);
  return p;
}

export function prizeStructure(def: Pick<EventDef, 'buyIn' | 'feePct' | 'paidPct' | 'guarantee' | 'pko' | 'kind' | 'satelliteFor'>, entries: number, targetBuyIn = 0): PrizeStructure {
  const fee = feeOf(def.buyIn, def.feePct);
  const share = def.pko ? def.pko.share : 0;
  const bountyUnit = Math.round(def.buyIn * share);
  const cashUnit = def.buyIn - bountyUnit;
  const cashFromEntries = cashUnit * entries;
  const bountyPool = bountyUnit * entries;
  const overlay = def.guarantee ? Math.max(0, def.guarantee - (cashFromEntries + bountyPool)) : 0;
  const prizePool = cashFromEntries + overlay;
  const base: Omit<PrizeStructure, 'paid' | 'payouts'> = { entries, buyIn: def.buyIn, fee, cashFromEntries, overlay, prizePool, bountyPool, bountyUnit, tickets: 0, ticketValue: 0, ticketCashRemainder: 0 };
  if (def.kind === 'satellite') {
    const value = targetBuyIn || def.buyIn * 10;
    const tickets = Math.min(Math.floor(prizePool / value), Math.max(0, entries - 1));
    const rem = prizePool - tickets * value;
    return { ...base, paid: tickets, payouts: [], tickets, ticketValue: value, ticketCashRemainder: rem };
  }
  const paid = Math.max(entries >= 18 ? 3 : entries >= 6 ? 2 : 1, Math.min(entries - 1, Math.round(entries * def.paidPct)));
  if (paid >= entries) return { ...base, paid: 1, payouts: [prizePool] };
  const minCash = Math.ceil(def.buyIn * 1.1);
  let payouts = split(prizePool, paid, 1.3);
  for (let a = 1.3; a >= 0.3 && payouts[paid - 1] < minCash; a -= 0.1) payouts = split(prizePool, paid, a);
  return { ...base, paid, payouts };
}

/** 순위(1부터) → 상금. 상금권 밖이면 0 */
export const prizeFor = (ps: PrizeStructure, place: number): number => ps.payouts[place - 1] ?? 0;

/** 동순위 그룹(헤즈업 토너먼트/슛아웃)은 같은 라운드 탈락자끼리 상금을 균등 분배한다 */
export function sharePrizes(ps: PrizeStructure, groups: number[][]): number[] {
  // groups[k] = 순위(1부터) 묶음 (예: [[1],[2],[3,4],[5,6,7,8]]). 반환은 place → prize
  const out: number[] = new Array(ps.entries).fill(0);
  for (const g of groups) {
    const total = g.reduce((s, p) => s + (ps.payouts[p - 1] ?? 0), 0);
    const base = Math.floor(total / g.length);
    let rem = total - base * g.length;
    for (const p of g) { out[p - 1] = base + (rem > 0 ? 1 : 0); if (rem > 0) rem--; }
  }
  return out;
}

export function bracketGroups(rounds: number): number[][] {
  // 승자 1, 결승 패자 2, 준결승 패자 3~4(공동), 8강 5~8(공동) …
  const groups: number[][] = [[1], [2]];
  let start = 3, size = 2;
  for (let r = 1; r < rounds; r++) { groups.push(Array.from({ length: size }, (_, k) => start + k)); start += size; size *= 2; }
  return groups;
}

/** 슛아웃 구조: 테이블마다 1명 진출. alive 가 tableSize 이하가 되면 결승 테이블. rounds[k] = k+1 라운드에서 탈락하는 인원 */
export function shootoutLayout(entries: number, tableSize: number): { finalSize: number; eliminated: number[] } {
  let alive = entries; const eliminated: number[] = [];
  while (alive > tableSize) { const winners = Math.ceil(alive / tableSize); eliminated.push(alive - winners); alive = winners; }
  return { finalSize: alive, eliminated };
}
/** 슛아웃 동순위 묶음: 결승 테이블 단독 순위 → 늦은 라운드 탈락자 → 이른 라운드 탈락자 */
export function shootoutGroups(entries: number, tableSize: number): number[][] {
  const { finalSize, eliminated } = shootoutLayout(entries, tableSize);
  const groups: number[][] = Array.from({ length: finalSize }, (_, i) => [i + 1]);
  let pos = finalSize + 1;
  for (let r = eliminated.length - 1; r >= 0; r--) { groups.push(Array.from({ length: eliminated[r] }, (_, k) => pos + k)); pos += eliminated[r]; }
  return groups;
}

/** 순위 → 상금(크레딧). 서버 정산과 클라이언트 표시가 같은 함수를 쓴다. 새틀라이트 티켓 구간은 별도(ticketsFor). */
export function prizeAtPlace(def: Pick<EventDef, 'buyIn' | 'feePct' | 'paidPct' | 'guarantee' | 'pko' | 'kind' | 'satelliteFor' | 'tableSize'>, entries: number, place: number, targetBuyIn = 0): number {
  const ps = prizeStructure(def, entries, targetBuyIn);
  if (def.kind === 'satellite') return place === ps.tickets + 1 ? ps.ticketCashRemainder : 0;
  if (def.kind === 'hu') return sharePrizes(ps, bracketGroups(Math.round(Math.log2(Math.max(2, entries)))))[place - 1] ?? 0;
  if (def.kind === 'shootout') {
    const ps2 = prizeStructure({ ...def, paidPct: Math.min(0.5, def.tableSize / entries) }, entries, targetBuyIn);
    return sharePrizes(ps2, shootoutGroups(entries, def.tableSize))[place - 1] ?? 0;
  }
  return prizeFor(ps, place);
}

/** 상금이 지급되는 마지막 순위(동순위 묶음은 묶음의 마지막). 랭킹 점수의 입상 인원(paid)으로 쓴다. */
export function paidPlacesOf(def: Parameters<typeof prizeAtPlace>[0], entries: number, targetBuyIn = 0): number {
  if (def.kind === 'satellite') return prizeStructure(def, entries, targetBuyIn).tickets;
  if (def.kind !== 'hu' && def.kind !== 'shootout') return prizeStructure(def, entries, targetBuyIn).paid;
  let last = 1;
  for (let p = 1; p <= entries; p++) if (prizeAtPlace(def, entries, p, targetBuyIn) > 0) last = p;
  return last;
}
export const ticketsFor = (def: Parameters<typeof prizeStructure>[0], entries: number, targetBuyIn: number) => prizeStructure(def, entries, targetBuyIn).tickets;
