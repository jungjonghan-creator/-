import { Card } from './cards';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

/** 외부 입력 행동. bet/raise 의 `to` 는 "이번 스트리트 내 내 총 베팅액" (추가 납부액 아님). */
export interface Action { type: ActionType; to?: number }
export type AllInAction = { type: 'allin' };

export interface Player {
  id: string;
  name: string;
  isHuman: boolean;
  aiId?: string;            // AI 프로필 id
  stack: number;
  // --- 핸드별 상태 ---
  inHand: boolean;          // 이번 핸드에 카드를 받았는가
  hole: Card[];
  bet: number;              // 현재 스트리트 베팅 총액
  invested: number;         // 이번 핸드 총 투입 (앤티 포함)
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  lastActBet: number | null; // 마지막 행동 후 currentBet (재레이즈 권한 판정)
  lastAction: string;
  busted: boolean;          // 토너먼트 탈락
  finishPlace?: number;
}

export interface HandEvent {
  seq: number;
  street: Street;
  seat: number;
  type: ActionType | 'sb' | 'bb' | 'ante';
  /** 이번 행동으로 실제 납부한 칩 */
  paid: number;
  /** 행동 후 이번 스트리트 총 베팅액 */
  toTotal: number;
  potBefore: number;
  allIn: boolean;
}

export interface PotResult { amount: number; eligible: number[]; winners: number[]; share: Record<number, number> }

export interface HandResult {
  pots: PotResult[];
  /** 좌석별 순손익 (획득 − 투입) */
  net: Record<number, number>;
  returned: Record<number, number>; // 미대응 베팅 반환
  shown: Record<number, { hole: Card[]; score: number }>;
  endedByFold: boolean;
}

export interface GameConfig {
  sb: number; bb: number; ante: number;
  maxSeats: number;
}

export interface HandRecord {
  handNo: number;
  seed: number;
  deck: Card[];                 // 전체 덱 순서 (확정)
  button: number;
  config: GameConfig;
  startStacks: { id: string; name: string; stack: number; seat: number; busted: boolean }[];
  events: HandEvent[];
  actions: { seat: number; action: Action | AllInAction }[]; // 재생용 입력
  board: Card[];
  holes: Record<number, Card[]>;
  result: HandResult | null;
}

export interface GameState {
  version: 1;
  config: GameConfig;
  handNo: number;
  button: number;
  seed: number;
  players: Player[];
  street: Street;
  board: Card[];
  deck: Card[];
  deckPos: number;
  burned: Card[];
  currentBet: number;
  minRaise: number;
  toAct: number | null;
  events: HandEvent[];
  actionLog: { seat: number; action: Action | AllInAction }[];
  result: HandResult | null;
  /** 핸드 시작 시 모든 칩 총량 (칩 보존 불변식) */
  totalChips: number;
  /** 핸드 시작 스택 */
  startStacks: number[];
  sbSeat: number; bbSeat: number;
  gameOver: boolean;
  /** 이번 핸드 시작 시점 칩 외 이벤트(리바이 등) 로그 */
  ledger: { handNo: number; seat: number; kind: 'rebuy' | 'topup'; amount: number }[];
}

export interface LegalActions {
  seat: number;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;       // 콜에 필요한 추가 칩 (스택 한도 적용)
  canRaise: boolean;        // bet 또는 raise 가능
  isBet: boolean;           // currentBet == 0 이면 bet
  minTo: number;            // 최소 총 베팅액
  maxTo: number;            // 올인 시 총 베팅액
  pot: number;
}
