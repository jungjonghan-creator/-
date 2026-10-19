import { allInLuck } from '../analysis/coach';
import { Stats, estimate } from '../ai/opponentModel';
import { createRng } from '../engine/rng';
import { categoryOf, describe, evaluate } from '../engine/evaluator';
import { cardToString } from '../engine/cards';
import { HandRecord } from '../engine/types';
import { byName, EventKind } from './characters';

export interface StoryLine { id: string; handNo: number; kind: 'talk' | 'narr' | 'system'; speaker: string; emoji: string; text: string; ts: number }

export interface DirectorCtx {
  rec: HandRecord;
  heroSeat: number;
  /** 이번 세션의 이전 핸드 포함 전체 기록 */
  history: HandRecord[];
  memory: Record<string, Stats>;
  /** 스토리 모드 여부: 스토리면 캐릭터 대사, 아니면 해설자만 */
  characters: boolean;
}

const NARR = { speaker: '해설', emoji: '🎙️' };
const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];
const hash = (a: number, s: string) => { let h = a * 31; for (const ch of s) h = (h * 33 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

export function directHand(ctx: DirectorCtx): StoryLine[] {
  const { rec, heroSeat } = ctx;
  const res = rec.result;
  if (!res) return [];
  const bb = rec.config.bb;
  const names = rec.startStacks.map((s) => s.name);
  const hero = names[heroSeat];
  const net = res.net[heroSeat] ?? 0;
  const netBB = net / bb;
  const potTotal = res.pots.reduce((t, p) => t + p.amount, 0);
  const lines: StoryLine[] = [];
  const ts = Date.now();
  let n = 0;
  const mk = (kind: StoryLine['kind'], speaker: string, emoji: string, text: string): StoryLine => ({ id: `${rec.handNo}-${n++}`, handNo: rec.handNo, kind, speaker, emoji, text, ts });
  const narr = (text: string) => lines.push(mk('narr', NARR.speaker, NARR.emoji, text));
  const talk = (seat: number | null, ev: EventKind) => {
    if (!ctx.characters || seat === null) return;
    const ch = byName(names[seat]);
    const arr = ch?.voice[ev];
    if (!ch || !arr?.length) return;
    lines.push(mk('talk', ch.name, ch.emoji, pick(arr, hash(rec.handNo, ev))));
  };

  const events = rec.events.filter((e) => e.type !== 'sb' && e.type !== 'bb' && e.type !== 'ante');
  const oppSeats = rec.startStacks.filter((s) => s.stack > 0 && s.seat !== heroSeat).map((s) => s.seat);
  const biggestWinner = oppSeats.filter((s) => (res.net[s] ?? 0) > 0).sort((a, b) => res.net[b] - res.net[a])[0] ?? null;
  const biggestLoser = oppSeats.filter((s) => (res.net[s] ?? 0) < 0).sort((a, b) => res.net[a] - res.net[b])[0] ?? null;
  const lastAggressor = [...events].reverse().find((e) => e.seat !== heroSeat && (e.type === 'bet' || e.type === 'raise'))?.seat ?? null;
  const heroActs = events.filter((e) => e.seat === heroSeat);
  const heroLast = heroActs[heroActs.length - 1];
  const heroHole = rec.holes[heroSeat] ?? [];
  const heroStr = heroHole.map(cardToString).join(' ');
  const boardKnown = (street: string) => rec.board.slice(0, street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5);

  // 1) 배드빔 (올인 시점 승률 78%+ 로 패배)
  let said = false;
  const allIn = res.endedByFold ? null : allInLuck(rec, heroSeat, createRng(rec.seed), 700);
  if (allIn?.applicable && allIn.heroEquity >= 0.78 && net < 0) {
    narr(`올인 시점 ${hero}의 승률은 ${Math.round(allIn.heroEquity * 100)}%였습니다. 이 패배는 판단이 아니라 운의 몫입니다.`);
    talk(biggestWinner, 'badBeat'); said = true;
  } else if (netBB >= 15) {
    const sh = res.shown[heroSeat];
    narr(`${hero}가 ${netBB.toFixed(0)}BB 규모의 큰 팟을 가져갑니다${sh ? ` (${describe(sh.score)}, ${heroStr})` : ''}.`);
    talk(biggestLoser, 'heroBigWin'); said = true;
  } else if (netBB <= -15) {
    const w = biggestWinner !== null ? res.shown[biggestWinner] : undefined;
    narr(`${hero}가 ${Math.abs(netBB).toFixed(0)}BB를 잃었습니다${w && biggestWinner !== null ? ` — ${names[biggestWinner]}의 ${describe(w.score)}` : ''}.`);
    talk(biggestWinner, 'heroBigLoss'); said = true;
  }
  // 2) 블러프 성공 / 영웅 콜 / 큰 폴드
  if (!said && res.endedByFold && net > 0 && heroLast && (heroLast.type === 'bet' || heroLast.type === 'raise') && heroLast.street !== 'preflop') {
    const bd = boardKnown(heroLast.street);
    if (bd.length >= 3 && categoryOf(evaluate([...heroHole, ...bd])) === 0) {
      narr(`${hero}의 ${heroStr}는 하이카드뿐 — 순수 블러프가 통했습니다.`);
      talk(biggestLoser ?? oppSeats[0] ?? null, 'heroBluffWin'); said = true;
    }
  }
  if (!said && !res.endedByFold && net > 0 && heroLast?.type === 'call' && heroLast.street === 'river' && heroLast.paid >= 0.4 * heroLast.potBefore) {
    const sh = res.shown[heroSeat];
    narr(`리버 큰 벳을 콜해 상대의 허세를 잡아냈습니다${sh ? ` (${describe(sh.score)})` : ''}.`);
    talk(lastAggressor ?? biggestLoser, 'heroHeroCall'); said = true;
  }
  if (!said && heroLast?.type === 'fold' && heroLast.street !== 'preflop') {
    const prev = [...events].reverse().find((e) => e.seat !== heroSeat && (e.type === 'bet' || e.type === 'raise'));
    const invested = rec.startStacks[heroSeat].stack + (net) - 0;
    void invested;
    if (prev && prev.paid >= 0.6 * Math.max(1, prev.potBefore) && -netBB >= 3) {
      narr(`${hero}가 팟의 ${Math.round((prev.paid / Math.max(1, prev.potBefore)) * 100)}% 벳 앞에서 물러납니다.`);
      talk(prev.seat, 'heroFoldBig'); said = true;
    }
  }
  if (!said && res.endedByFold && net > 0 && heroLast && heroLast.street === 'preflop' && heroLast.type === 'raise' && hash(rec.handNo, 'steal') % 4 === 0) {
    talk(biggestLoser ?? oppSeats[0] ?? null, 'heroSteal'); said = true;
  }
  // 3) 연승/연패
  if (!said) {
    const recent = ctx.history.slice(-3).map((r) => { const s = r.startStacks.find((x) => x.id === 'hero')!.seat; return r.result?.net[s] ?? 0; });
    if (recent.length === 3 && recent.every((x) => x > 0)) { narr('3연승. 흐름이 이어집니다.'); talk(oppSeats[hash(rec.handNo, 'w') % Math.max(1, oppSeats.length)] ?? null, 'streakWin'); said = true; }
    else if (recent.length === 3 && recent.every((x) => x < 0)) { narr('3연패. 잠깐 호흡을 고를 때입니다.'); talk(oppSeats[hash(rec.handNo, 'l') % Math.max(1, oppSeats.length)] ?? null, 'streakLoss'); said = true; }
  }
  // 4) 상대가 칩을 다시 삼
  for (const s of oppSeats) {
    const start = rec.startStacks[s].stack;
    if (start > 0 && start + (res.net[s] ?? 0) === 0) { narr(`${names[s]}의 칩이 바닥났습니다. 곧 다시 앉습니다.`); talk(s, 'oppRebuy'); said = true; break; }
  }
  // 5) 상대의 적응 코멘트 (20핸드마다, 표본이 쌓인 뒤)
  if (ctx.characters && rec.handNo % 20 === 0) {
    const me = ctx.memory['hero'];
    const adaptive = oppSeats.find((s) => ['NOVA', '고스트', '닥터 한', '리나'].includes(names[s]));
    if (me && me.hands >= 20 && adaptive !== undefined) {
      const fcb = me.fcbOpp >= 4 ? me.fcb / me.fcbOpp : null;
      const vp = estimate.vpip(me), pf = estimate.pfr(me);
      const who = names[adaptive];
      let text: string | null = null;
      if (fcb !== null && fcb >= 0.6) text = `${hero}, C-bet에 ${Math.round(fcb * 100)}%나 접더라. 다음엔 더 자주 쏘지.`;
      else if (vp < 0.16) text = `너무 얌전해. 네가 들어오면 다들 접어야 한다는 걸 알아.`;
      else if (vp > 0.42) text = `${Math.round(vp * 100)}%나 참여하네. 약한 핸드로 오는 걸 이용해 줄게.`;
      else if (vp - pf > 0.15) text = `콜만 하고 레이즈는 안 하더라. 주도권은 내가 가져갈게.`;
      if (text) { lines.push(mk('talk', who, byName(who)?.emoji ?? '🗣️', text)); said = true; }
    }
  }
  // 6) 평범한 핸드: 가끔 분위기 대사
  if (!said && ctx.characters && rec.handNo % 4 === 0 && oppSeats.length) {
    talk(oppSeats[hash(rec.handNo, 'idle') % oppSeats.length], 'idle');
  }
  return lines.slice(0, 3);
}

/** 세션 종료 시 하이라이트/한 줄 요약 */
export function sessionHighlights(history: HandRecord[], heroId = 'hero') {
  let best: { net: number; rec: HandRecord } | null = null, worst: { net: number; rec: HandRecord } | null = null;
  let total = 0;
  for (const r of history) {
    const seat = r.startStacks.find((s) => s.id === heroId)!.seat;
    const n = (r.result?.net[seat] ?? 0) / r.config.bb;
    total += n;
    if (!best || n > best.net) best = { net: n, rec: r };
    if (!worst || n < worst.net) worst = { net: n, rec: r };
  }
  const fmtH = (x: { net: number; rec: HandRecord } | null) => (x ? `핸드 #${x.rec.handNo} ${x.net >= 0 ? '+' : ''}${x.net.toFixed(0)}BB` : undefined);
  const headline = history.length === 0 ? '자리에 앉았다가 곧바로 일어났다.'
    : total >= 30 ? '손이 뜨거운 밤. 테이블의 분위기를 바꿨다.'
    : total >= 5 ? '조용히, 그러나 꾸준히 칩을 늘렸다.'
    : total > -5 ? '팽팽한 승부. 서로의 패를 읽느라 시간이 흘렀다.'
    : total > -30 ? '조금 잃었지만 배운 것이 있는 밤.'
    : '혹독한 밤. 칩보다 중요한 건 다음 판의 마음가짐이다.';
  return { headline, best: fmtH(best), worst: fmtH(worst), totalBB: total };
}
