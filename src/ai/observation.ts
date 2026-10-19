import { Card } from '../engine/cards';
import { HandEvent, GameState, LegalActions, Street } from '../engine/types';
import { legalActions, potTotal } from '../engine/game';

/**
 * AI 가 볼 수 있는 유일한 정보. 상대 홀카드, 덱 순서, 미공개 카드는 구조적으로 포함되지 않는다.
 * (GameState 를 AI 모듈에 직접 넘기지 않는다 — decide() 는 Observation 만 받는다.)
 */
export interface PublicPlayer {
  seat: number; id: string; name: string; stack: number; bet: number; invested: number;
  folded: boolean; allIn: boolean; inHand: boolean; position: string; isHero: boolean;
}
export interface Observation {
  seat: number;
  handNo: number;
  street: Street;
  hole: [Card, Card];
  board: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  bb: number;
  ante: number;
  button: number;
  players: PublicPlayer[];
  history: HandEvent[];
  legal: LegalActions;
  /** 영웅 기준 유효 스택 (영웅 스택+베팅, 활성 상대 중 최대 스택+베팅 중 작은 값) */
  effStack: number;
  position: string;
  /** 토너먼트 공개 정보 (남은 인원, 입상 인원, 평균 스택). 캐시게임이면 없음 */
  tournament?: { playersLeft: number; paid: number; avgStack: number };
}

export function positionLabels(s: GameState): Record<number, string> {
  const n = s.players.length;
  const seatsIn = s.players.map((p, i) => ({ p, i })).filter(({ p }) => p.inHand).map(({ i }) => i);
  const order: number[] = []; // 버튼 다음부터 시계방향
  for (let k = 1; k <= n; k++) { const i = (s.button + k) % n; if (seatsIn.includes(i)) order.push(i); }
  // order: SB, BB, UTG, ..., BTN (헤즈업: BTN(=SB), BB)
  const labels: Record<number, string> = {};
  const m = order.length;
  if (m === 2) { labels[s.button] = 'BTN/SB'; labels[order[0] === s.button ? order[1] : order[0]] = 'BB'; return labels; }
  const mid = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'];
  order.forEach((seat, idx) => {
    if (idx === m - 1) labels[seat] = 'BTN';
    else if (idx === 0) labels[seat] = 'SB';
    else if (idx === 1) labels[seat] = 'BB';
    else {
      const k = idx - 2; // 0..(m-4)
      const fromEnd = m - 2 - idx; // CO=1, HJ=2 ...
      labels[seat] = fromEnd === 1 ? 'CO' : fromEnd === 2 && m >= 6 ? 'HJ' : mid[Math.min(k, 3)];
    }
  });
  return labels;
}

export function observe(s: GameState, seat: number, tournament?: Observation['tournament']): Observation {
  const hero = s.players[seat];
  const labels = positionLabels(s);
  const legal = (s.toAct === seat ? legalActions(s) : null) ?? {
    seat, canFold: false, canCheck: false, canCall: false, callAmount: 0, canRaise: false, isBet: false, minTo: 0, maxTo: 0, pot: potTotal(s),
  };
  const players: PublicPlayer[] = s.players.map((p, i) => ({
    seat: i, id: p.id, name: p.name, stack: p.stack, bet: p.bet, invested: p.invested, folded: p.folded, allIn: p.allIn,
    inHand: p.inHand, position: labels[i] ?? '', isHero: i === seat,
  }));
  const opp = players.filter((p) => !p.isHero && p.inHand && !p.folded);
  const maxOpp = opp.reduce((m, p) => Math.max(m, p.stack + p.bet), 0);
  return {
    seat, handNo: s.handNo, street: s.street, hole: [hero.hole[0], hero.hole[1]], board: [...s.board], pot: potTotal(s),
    currentBet: s.currentBet, minRaise: s.minRaise, bb: s.config.bb, ante: s.config.ante, button: s.button,
    players, history: s.events.map((e) => ({ ...e })), legal: { ...legal }, effStack: Math.min(hero.stack + hero.bet, maxOpp),
    position: labels[seat] ?? '',
    ...(tournament ? { tournament } : {}),
  };
}
