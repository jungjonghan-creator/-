import { describe, it, expect } from 'vitest';
import { CHARACTERS } from '../src/story/characters';
import { directHand, sessionHighlights } from '../src/story/director';
import { applyAction, toHandRecord } from '../src/engine/game';
import { mkGame, startRigged } from './helpers';
import { createRng } from '../src/engine/rng';
import { newSession, beginHand, runAIUntilHuman, humanAct } from '../src/game/session';
import { legalActions } from '../src/engine/game';

describe('연출 디렉터', () => {
  const heroNovaSession = () => newSession({ mode: 'cash', seats: 2, startBB: 100, bb: 100, speed: 'normal', humanName: 'TETO', seed: 3, ais: [{ profileId: 'Balanced', difficulty: 3 }], aiNames: ['NOVA'] });

  it('큰 팟 승리 시 해설 + 라이벌 대사, 같은 입력이면 같은 출력(결정론)', () => {
    const g = mkGame([5000, 5000]);
    g.players[1].name = 'NOVA'; g.players[1].isHuman = false;
    let s = startRigged(g, ['As Ad', 'Kh Kd'], '2c 7d 9h Js 3c');
    s = applyAction(s, { type: 'allin' }); s = applyAction(s, { type: 'allin' });
    const rec = toHandRecord(s); rec.startStacks[0].id = 'hero';
    const a = directHand({ rec, heroSeat: 0, history: [], memory: {}, characters: true });
    const b = directHand({ rec, heroSeat: 0, history: [], memory: {}, characters: true });
    expect(a.map((l) => l.text)).toEqual(b.map((l) => l.text));
    expect(a.some((l) => l.kind === 'narr' && /큰 팟/.test(l.text))).toBe(true);
    const talk = a.find((l) => l.kind === 'talk');
    expect(talk?.speaker).toBe('NOVA');
    expect(CHARACTERS.nova.voice.heroBigWin).toContain(talk!.text);
  });
  it('배드빔: 올인 승률 78%+ 로 졌을 때 운 안내', () => {
    const g = mkGame([5000, 5000]);
    g.players[1].name = 'NOVA'; g.players[1].isHuman = false;
    let s = startRigged(g, ['As Ad', 'Kh Kd'], 'Ac 7d 9h Kc Ks');
    s = applyAction(s, { type: 'allin' }); s = applyAction(s, { type: 'allin' });
    const rec = toHandRecord(s); rec.startStacks[0].id = 'hero';
    const lines = directHand({ rec, heroSeat: 0, history: [], memory: {}, characters: true });
    expect(lines[0].text).toMatch(/운의 몫/);
  });
  it('캐릭터 비활성(일반 모드)이면 해설만 나오고 대사는 없다', () => {
    const g = mkGame([5000, 5000]);
    g.players[1].name = 'NOVA';
    let s = startRigged(g, ['As Ad', 'Kh Kd'], '2c 7d 9h Js 3c');
    s = applyAction(s, { type: 'allin' }); s = applyAction(s, { type: 'allin' });
    const rec = toHandRecord(s); rec.startStacks[0].id = 'hero';
    const lines = directHand({ rec, heroSeat: 0, history: [], memory: {}, characters: false });
    expect(lines.every((l) => l.kind !== 'talk')).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
  });
  it('실제 세션 40핸드: 대사 줄 수가 폭주하지 않고 모든 화자가 테이블 참가자', () => {
    let s = heroNovaSession();
    const rng = createRng(5);
    const lines: string[] = [];
    for (let h = 0; h < 40; h++) {
      s = beginHand(s, rng); s = runAIUntilHuman(s);
      let g = 0;
      while (s.game.street !== 'complete' && g++ < 100) { const la = legalActions(s.game)!; s = runAIUntilHuman(humanAct(s, la.canCheck ? { type: 'check' } : la.callAmount > 600 ? { type: 'fold' } : { type: 'call' })); }
      const rec = s.records[s.records.length - 1];
      const out = directHand({ rec, heroSeat: 0, history: s.records.slice(0, -1), memory: s.memory, characters: true });
      expect(out.length).toBeLessThanOrEqual(3);
      out.forEach((l) => { if (l.kind === 'talk') expect(l.speaker).toBe('NOVA'); lines.push(l.text); });
    }
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.length).toBeLessThan(80);
    const hl = sessionHighlights(s.records);
    expect(hl.headline.length).toBeGreaterThan(5);
  }, 120000);
});
