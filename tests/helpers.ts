import { parseCards, Card, newDeck } from '../src/engine/cards';
import { createGame, makePlayer, startHandWithDeck } from '../src/engine/game';
import { GameState } from '../src/engine/types';

/** 지정 홀카드/보드로 덱을 구성한다. 좌석 순서는 SB부터 시계방향 배분 규칙을 따른다. */
export function riggedDeck(game: GameState, holes: string[], board: string): Card[] {
  const n = game.players.filter((p) => !p.busted && p.stack > 0).length;
  const button = nextAlive(game, game.button);
  const sb = n === 2 ? button : nextAlive(game, button);
  const order: number[] = [];
  let c = sb;
  for (let k = 0; k < game.players.length; k++) { if (!game.players[c].busted && game.players[c].stack > 0) order.push(c); c = (c + 1) % game.players.length; }
  const used: Card[] = [];
  const deck: Card[] = new Array(52).fill(-1);
  holes.forEach((h, seat) => {
    const cs = parseCards(h);
    const pos = order.indexOf(seat);
    deck[pos] = cs[0]; deck[order.length + pos] = cs[1];
    used.push(...cs);
  });
  const b = parseCards(board);
  const base = order.length * 2;
  // burn, flop*3, burn, turn, burn, river
  const idx = [base + 1, base + 2, base + 3, base + 5, base + 7];
  b.forEach((cd, i) => { deck[idx[i]] = cd; used.push(cd); });
  const rest = newDeck().filter((x) => !used.includes(x));
  for (let i = 0; i < 52; i++) if (deck[i] === -1) deck[i] = rest.shift()!;
  return deck;
}
function nextAlive(g: GameState, from: number) {
  for (let k = 1; k <= g.players.length; k++) { const i = (from + k) % g.players.length; if (!g.players[i].busted && g.players[i].stack > 0) return i; }
  return -1;
}

export function mkGame(stacks: number[], cfg = { sb: 50, bb: 100, ante: 0, maxSeats: 9 }) {
  const players = stacks.map((st, i) => makePlayer('p' + i, 'P' + i, st, i === 0));
  return createGame(cfg, players, 1);
}
export function startRigged(g: GameState, holes: string[], board: string) {
  return startHandWithDeck(g, riggedDeck(g, holes, board), 1);
}
