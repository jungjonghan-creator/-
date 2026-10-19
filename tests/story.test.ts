import { describe, it, expect } from 'vitest';
import { CHAPTERS, START_BANKROLL } from '../src/story/chapters';
import { CHARACTERS, byName } from '../src/story/characters';
import { StoryState, canSit, chapterOf, leave, minBuyIn, needsLoan, netWorth, newStory, sit, takeLoan, topUp } from '../src/story/state';
import { directHand, sessionHighlights } from '../src/story/director';
import { applyAction, toHandRecord } from '../src/engine/game';
import { mkGame, startRigged } from './helpers';
import { createRng } from '../src/engine/rng';
import { newSession, beginHand, runAIUntilHuman, humanAct } from '../src/game/session';
import { legalActions } from '../src/engine/game';
import { PROFILES } from '../src/ai/profiles';

const ch1 = chapterOf(1);

describe('스토리 데이터', () => {
  it('모든 라이벌이 실제 AI 성향에 매핑되고 대사가 있다', () => {
    for (const c of Object.values(CHARACTERS)) {
      expect(PROFILES[c.profileId]).toBeTruthy();
      expect(c.voice.heroBigWin?.length).toBeGreaterThan(0);
      expect(c.bio.length).toBeGreaterThan(10);
    }
    for (const ch of CHAPTERS) {
      expect(ch.rivals.length).toBe(ch.seats - 1);
      ch.rivals.forEach((r) => expect(CHARACTERS[r.id]).toBeTruthy());
      expect(ch.intro.length).toBeGreaterThan(0);
    }
    expect(byName('NOVA')?.id).toBe('nova');
  });
  it('챕터 난이도·목표가 단조 증가', () => {
    for (let i = 1; i < CHAPTERS.length; i++) expect(CHAPTERS[i].goalNetWorth).toBeGreaterThan(CHAPTERS[i - 1].goalNetWorth);
  });
});

describe('뱅크롤/챕터 상태', () => {
  it('앉기→리바이→일어나기: 칩이 보존된다 (자본+테이블=상수, 손익만 반영)', () => {
    let s = newStory();
    expect(s.bankroll).toBe(START_BANKROLL);
    s = sit(s, ch1, 50);
    expect(s.bankroll).toBe(START_BANKROLL - 1000);
    expect(s.seated?.buyIn).toBe(1000);
    s = topUp(s, 500);
    expect(s.bankroll).toBe(START_BANKROLL - 1500);
    expect(netWorth(s, 1500)).toBe(START_BANKROLL);
    const after = leave(s, 2100, 10, '테스트');
    expect(after.bankroll).toBe(START_BANKROLL - 1500 + 2100);
    expect(after.seated).toBeNull();
    expect(after.lastSummary?.net).toBe(600);
    expect(() => sit({ ...after, bankroll: 10 }, ch1, 50)).toThrow();
    expect(() => topUp(after, 1)).toThrow();
  });
  it('빚: 최소 바이인 미만이면 대출 제안, 이익은 빚부터 자동 상환(순자산 불변)', () => {
    let s = { ...newStory(), bankroll: 500 };
    expect(needsLoan(s, ch1)).toBe(true);
    expect(canSit(s, ch1, 50)).toBe(false);
    s = takeLoan(s, ch1);
    expect(s.debt).toBe(2000); expect(s.bankroll).toBe(2500);
    expect(netWorth(s)).toBe(500);
    s = sit(s, ch1, 50);
    const w0 = netWorth(s, 1000);
    s = leave(s, 4000, 10, 'x');
    expect(s.debt).toBeLessThan(2000);
    expect(netWorth(s)).toBe(w0 + 3000);
  });
  it('목표 순자산 + 최소 핸드 수를 모두 채워야 클리어, 다음 챕터 해금', () => {
    let s = { ...newStory(), bankroll: 5800 };
    s = sit(s, ch1, 50);
    let r = leave(s, 1500, 10, 'x'); // 순자산 6300 ≥ 6000 이지만 핸드 10 < 40
    expect(r.cleared).toEqual([]);
    expect(r.chapterJustCleared).toBeNull();
    let s2: StoryState = { ...r, handsInChapter: { 1: 35 } };
    s2 = sit(s2, ch1, 50);
    r = leave(s2, 1200, 10, 'x');
    expect(r.cleared).toEqual([1]);
    expect(r.unlocked).toBe(2);
    expect(r.chapterJustCleared).toBe(1);
    expect(minBuyIn(ch1)).toBe(1000);
  });
});

describe('연출 디렉터', () => {
  const heroNovaSession = () => newSession({ mode: 'cash', seats: 2, startBB: 100, bb: 100, speed: 'normal', humanName: 'TETO', seed: 3, ais: [{ profileId: 'Balanced', difficulty: 3 }], aiNames: ['NOVA'], story: { chapter: 3, buyIn: 10000 } });

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
