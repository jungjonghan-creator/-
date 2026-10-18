import { applyAction, createGame, makePlayer, startHandWithDeck } from './game';
import { GameState, HandRecord } from './types';

/** 핸드 기록으로부터 게임을 재구성해 끝까지 재생. upTo 를 주면 해당 액션 수까지만 재생. */
export function replayRecord(rec: HandRecord, upTo = Infinity): GameState {
  const players = rec.startStacks.map((s) => makePlayer(s.id, s.name, s.stack, s.id === 'hero'));
  players.forEach((p, i) => { if (rec.startStacks[i].stack <= 0) p.busted = true; });
  const g = createGame({ ...rec.config, maxSeats: Math.max(rec.config.maxSeats, players.length) }, players, rec.seed);
  g.handNo = rec.handNo - 1;
  let s = startHandWithDeck(g, rec.deck, rec.seed, rec.button);
  let n = 0;
  for (const { action } of rec.actions) {
    if (n++ >= upTo) break;
    s = applyAction(s, action);
  }
  return s;
}

/** 기록이 엔진 규칙대로 재생되어 같은 결과를 내는지 검증 */
export function verifyRecord(rec: HandRecord): string[] {
  const errs: string[] = [];
  try {
    if (rec.deck.length !== 52 || new Set(rec.deck).size !== 52 || rec.deck.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) return ['덱이 52장 고유 카드가 아님'];
    const s = replayRecord(rec);
    if (s.street !== 'complete') errs.push('재생 결과가 종료되지 않음');
    if (JSON.stringify(s.board) !== JSON.stringify(rec.board)) errs.push('보드 불일치');
    if (JSON.stringify(s.result?.net) !== JSON.stringify(rec.result?.net)) errs.push('정산 불일치');
  } catch (e) {
    errs.push('재생 실패: ' + (e as Error).message);
  }
  return errs;
}
