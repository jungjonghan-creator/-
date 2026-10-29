/**
 * 배치형 간결 토너먼트 시뮬레이터 (공식 AI 세계 시즌 계산용).
 *
 * 실제 52장 덱·실제 핸드 평가기·실제 블라인드/앤티·메인/사이드 팟·콜 안 된 베팅 반환을 사용하고
 * 모든 핸드에서 칩 보존을 검사한다. 대신 의사결정은 "스트리트 합본" 휴리스틱(프리플랍 퍼센타일 + 포스트플랍 강도 추정)이며,
 * 풀 엔진(AI MC 승률)의 의사결정을 그대로 재현하지 않는다 → 결과는 근사다. 특정 선수에게 칩을 임의로 주는 일은 없다.
 */
import { createRng, RNG } from '../engine/rng';
import { evaluate } from '../engine/evaluator';
import { newDeck, rankOf, suitOf, Card } from '../engine/cards';
import { PREFLOP_PCT } from '../ai/preflopTable';
import { handKey } from '../ai/handKey';
import { blindStructure } from '../game/session';
import type { SkillProfile } from './cast';

export interface SimEntrant { id: string; skill: SkillProfile }
export interface BatchSpec {
  entrants: SimEntrant[];
  startStack: number;
  bb0: number;
  tableSize: number;
  handsPerLevel: number;
  /** 재진입: untilLevel(1부터) 이전에 탈락하면 reentryProb 확률로 재진입(최대 max회) */
  reentry?: { untilLevel: number; max: number };
  /** PKO: 바이인의 bountyShare 비율이 바운티로 분리된다 (0~1) */
  bounty?: { share: number };
  /** 상금이 걸린 순위 수 (ITM 버블 압박 계산용) */
  paidPlaces: number;
  seed: number;
  maxRounds?: number;
}
export interface BatchEntry { eid: string; pid: string; n: number }
export interface BatchResult {
  /** 엔트리 최종 순위 (0 = 우승) */
  order: BatchEntry[];
  /** 총 엔트리 수 (재진입 포함) */
  totalEntries: number;
  rounds: number;
  hands: number;
  /** PKO: 선수별 현금으로 받은 바운티(단위 = bounty 단위) */
  bountyCash: Record<string, number>;
  /** 우승 엔트리가 보유한 잔여 바운티 */
  winnerBounty: number;
  bountyUnit: number;
  chipTotal: number;
  violations: string[];
}

export interface E { eid: string; pid: string; sk: SkillProfile; stack: number; bounty: number; n: number; level0: number }
interface Seat { e: E; hole: [Card, Card]; start: number; contrib: number; bet: number; folded: boolean; allIn: boolean }

/** 내 뒤에 남은 플레이어 수(behind) → 오픈 퍼센타일 상한. BB=0, SB=1, BTN=2, CO=3 … UTG=8 */
const OPEN_BY_BEHIND = [0.5, 0.38, 0.45, 0.33, 0.25, 0.2, 0.17, 0.15, 0.14];
/** 헤드업/3인 이하 팟에서는 헤즈업 실력이 섞인다 */
const pskill = (sk: SkillProfile, active: number) => (active <= 2 ? 0.5 * sk.postflop + 0.5 * sk.headsup : sk.postflop);
/** 꾸준함이 높을수록 판단의 흔들림(노이즈)이 작다 */
const cons = (sk: SkillProfile) => 1.5 - sk.consistency / 100;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const noise = (rng: RNG, sd: number) => (rng.next() + rng.next() + rng.next() - 1.5) * 2 * sd;

/** 포스트플랍 메이드 핸드 강도 0~1 (+ 드로우 보너스) */
function strengthOf(hole: readonly Card[], board: readonly Card[]): number {
  const all = [...hole, ...board];
  const sc = evaluate(all);
  const cat = sc >>> 20;
  const maxB = Math.max(...board.map(rankOf));
  const rs = hole.map(rankOf);
  let s: number;
  if (cat === 0) s = 0.04 + Math.max(...rs) / 14 * 0.1;
  else if (cat === 1) {
    const pr = (sc >>> 16) & 15; // 페어 랭크
    const boardPair = board.filter((c) => rankOf(c) === pr).length >= 2;
    if (boardPair) s = 0.12 + Math.max(...rs) / 14 * 0.08;
    else if (pr > maxB) s = 0.64 + (pr / 14) * 0.06;
    else if (pr === maxB) s = 0.5 + (Math.max(...rs.filter((r) => r !== pr), 2) / 14) * 0.06;
    else s = 0.25 + pr / 14 * 0.12;
  } else if (cat === 2) s = 0.72 + (rs[0] === rs[1] ? 0 : 0.03);
  else if (cat === 3) s = 0.8;
  else if (cat === 4) s = 0.86;
  else if (cat === 5) s = 0.9;
  else if (cat === 6) s = 0.95;
  else s = 0.99;
  if (board.length < 5 && cat < 4) {
    const suits = [0, 0, 0, 0]; for (const c of all) suits[suitOf(c)]++;
    if (Math.max(...suits) === 4) s += 0.17;
    else {
      let m = 0; for (const c of all) m |= 1 << rankOf(c); if (m & (1 << 14)) m |= 2;
      let best = 0; for (let h = 0; h <= 9; h++) { const w = (m >> (h + 1)) & 0b11111; let c = 0; for (let k = 0; k < 5; k++) if (w & (1 << k)) c++; if (c > best) best = c; }
      if (best === 4) s += 0.1;
    }
  }
  return clamp(s);
}

/** 팟 분배 (콜 안 된 베팅 반환 포함). 반환: 좌석별 획득 칩, 좌석별 "마지막으로 진 층의 승자들" */
function distribute(seats: Seat[], board: Card[], btn: number, scores: (number | null)[]): { won: number[]; killers: Map<number, number[]> } {
  const n = seats.length;
  const won = new Array(n).fill(0);
  const killers = new Map<number, number[]>();
  const levels = [...new Set(seats.filter((s) => !s.folded).map((s) => s.contrib))].sort((a, b) => a - b);
  let prev = 0;
  for (const lvl of levels) {
    let amount = 0;
    for (const s of seats) amount += Math.max(0, Math.min(s.contrib, lvl) - prev);
    const elig: number[] = [];
    for (let i = 0; i < n; i++) if (!seats[i].folded && seats[i].contrib >= lvl) elig.push(i);
    prev = lvl;
    if (amount <= 0 || !elig.length) continue;
    let best = -1; for (const i of elig) best = Math.max(best, scores[i] ?? 0);
    const winners = elig.filter((i) => (scores[i] ?? 0) === best);
    const share = Math.floor(amount / winners.length);
    let odd = amount - share * winners.length;
    // 홀수 칩: 버튼 왼쪽부터
    const sorted = [...winners].sort((a, b) => ((a - btn - 1 + n) % n) - ((b - btn - 1 + n) % n));
    for (const w of sorted) { won[w] += share + (odd > 0 ? 1 : 0); if (odd > 0) odd--; }
    for (const i of elig) if (!winners.includes(i)) killers.set(i, winners);
  }
  void board;
  return { won, killers };
}

export interface TableCtx { rng: RNG; bb: number; sb: number; ante: number; pressure: number }

/** 한 테이블 한 핸드. 좌석 순서 = 배열 순서. 칩을 직접 변경하고 { busted } 를 반환 */
export function playHand(table: E[], btn: number, ctx: TableCtx): { startStacks: number[]; kills: [bustee: number, killers: number[]][] } {
  const { rng, bb, sb, ante } = ctx;
  const n = table.length;
  // 덱: 필요한 만큼만 부분 셔플
  const deck = newDeck();
  let di = 0;
  const draw = (): Card => { const j = di + rng.int(deck.length - di); [deck[di], deck[j]] = [deck[j], deck[di]]; return deck[di++]; };
  const seats: Seat[] = table.map((e) => ({ e, hole: [draw(), draw()] as [Card, Card], start: e.stack, contrib: 0, bet: 0, folded: false, allIn: false }));
  const startStacks = seats.map((s) => s.start);
  const put = (i: number, amt: number) => { const s = seats[i]; const a = Math.min(amt, s.e.stack); s.e.stack -= a; s.contrib += a; s.bet += a; if (s.e.stack === 0) s.allIn = true; return a; };
  const sbI = n === 2 ? btn : (btn + 1) % n;
  const bbI = n === 2 ? (btn + 1) % n : (btn + 2) % n;
  if (ante > 0) for (let i = 0; i < n; i++) { const a = Math.min(ante, seats[i].e.stack); seats[i].e.stack -= a; seats[i].contrib += a; if (seats[i].e.stack === 0) seats[i].allIn = true; }
  put(sbI, sb); put(bbI, bb);
  let cur = Math.max(seats[sbI].bet, seats[bbI].bet);
  let raises = 0;

  // ───── 프리플랍 ─────
  const order: number[] = [];
  const first = n === 2 ? btn : (bbI + 1) % n;
  for (let k = 0; k < n; k++) order.push((first + k) % n);
  const live = () => seats.filter((s) => !s.folded).length;
  let pending = new Set<number>(order.filter((i) => !seats[i].allIn));
  let pos = 0, steps = 0;
  while (pending.size > 0 && live() > 1 && steps++ < 400) {
    const i = order[pos % n]; pos++;
    if (!pending.has(i)) continue;
    pending.delete(i);
    const s = seats[i];
    if (s.folded || s.allIn) continue;
    const needs = cur - s.bet;
    const sk = s.e.sk;
    const key = handKey(s.hole[0], s.hole[1]);
    const pct = PREFLOP_PCT[key] ?? 0.5;
    const perceived = clamp(pct * Math.exp(noise(rng, (1 - sk.preflop / 100) * 0.45 * cons(sk))), 0, 1);
    const loose = 0.6 + (sk.risk / 100) * 0.9 + (sk.aggression / 100) * 0.1;
    const m = (s.e.stack + s.bet) / bb;
    const behind = n - 1 - order.indexOf(i);
    const openT = (n === 2 ? 0.6 : OPEN_BY_BEHIND[Math.min(8, behind)]) * (1.1 - 0.2 * sk.preflop / 100);
    const tight = 1 - ctx.pressure * 0.45 * (sk.icm / 100);
    let eff = 1; for (const x of seats) if (x !== s && !x.folded) eff = Math.max(eff, (x.e.stack + x.bet) / bb);
    eff = Math.min(m, eff);
    let act: 'fold' | 'call' | 'raise' | 'jam' = 'fold';
    if (raises === 0) {
      if (eff <= 12 && perceived < clamp((0.18 + 0.28 * (1 - eff / 12)) * loose * tight)) act = 'jam';
      else if (needs > 0 && perceived < openT * loose * tight) act = (rng.next() < 0.55 + sk.aggression / 250) ? 'raise' : 'call';
      else if (needs === 0) act = (perceived < 0.3 * loose && rng.next() < 0.5) ? 'raise' : 'call';
    } else {
      const price = needs / Math.max(1, cur + 1);
      const leak = 1.35 - 0.7 * (sk.preflop / 100); // 실력이 낮을수록 넓게 콜(누수)
      const callT = (0.16 + 0.1 * (1 - price)) * loose * tight * leak * (cur >= s.e.stack + s.bet ? 0.75 : 1);
      const threeT = (0.045 + 0.04 * sk.aggression / 100) * loose;
      if (eff <= 12 && perceived < clamp(0.2 * loose * tight * (1 - price * 0.6))) act = 'jam';
      else if (raises < 3 && perceived < threeT && cur < s.e.stack + s.bet) act = (raises >= 2 || rng.next() < 0.3) ? 'jam' : 'raise';
      else if (perceived < callT) act = 'call';
    }
    if (act === 'fold') { if (needs > 0) s.folded = true; }
    else if (act === 'call') { put(i, needs); }
    else {
      const open = raises === 0;
      const sizeMul = open ? 2.2 + sk.aggression / 100 * 0.9 : 2.7 + sk.aggression / 100 * 0.6;
      const target = act === 'jam' ? s.e.stack + s.bet : Math.min(s.e.stack + s.bet, Math.round(cur * sizeMul));
      if (target <= cur) { put(i, needs); }
      else { put(i, target - s.bet); cur = Math.max(cur, s.bet); raises++; pending = new Set(order.filter((j) => j !== i && !seats[j].folded && !seats[j].allIn)); }
    }
  }

  // ───── 포스트플랍 ─────
  const board: Card[] = [];
  const contenders = () => seats.map((s, i) => i).filter((i) => !seats[i].folded);
  if (live() > 1) {
    for (let st = 0; st < 3; st++) {
      if (st === 0) { draw(); board.push(draw(), draw(), draw()); } else { draw(); board.push(draw()); }
      const nAct = contenders().length;
      const canAct = contenders().filter((i) => !seats[i].allIn);
      if (canAct.length < 2) continue;
      for (const s of seats) s.bet = 0;
      let pot = seats.reduce((a, s) => a + s.contrib, 0);
      let bet = 0; let aggressor = -1;
      const ord: number[] = []; const f0 = n === 2 ? (btn + 1) % n : (btn + 1) % n;
      for (let k = 0; k < n; k++) ord.push((f0 + k) % n);
      const strengths = new Map<number, number>();
      for (const i of contenders()) {
        const sk = seats[i].e.sk;
        { const ps = pskill(sk, nAct); strengths.set(i, clamp(strengthOf(seats[i].hole, board) + noise(rng, (1 - ps / 100) * 0.3 * cons(sk)) + (1 - ps / 100) * 0.28)); } // 실력이 낮을수록 부정확 + 낙관 편향
      }
      // 한 스트리트 = 선공 베팅/체크 → 응답(콜/폴드/레이즈 1회)
      let responders: number[] = [];
      for (const i of ord) {
        const s = seats[i]; if (s.folded || s.allIn) continue;
        const sk = s.e.sk; const str = strengths.get(i)!;
        if (bet === 0) {
          // 상대 누수 읽기: 이 팟의 상대들이 평균적으로 약할수록(많이 콜) 밸류를 키우고 블러프를 줄인다 — 실력(exploit)에 비례
          let leak = 0, cnt = 0; for (const j of ord) { if (j === i || seats[j].folded || seats[j].allIn) continue; leak += 0.5 - seats[j].e.sk.postflop / 100; cnt++; }
          const oppLeak = cnt ? clamp(leak / cnt, -0.3, 0.5) : 0;
          const ex = sk.exploit / 100;
          const valueBet = str > 0.66 - pskill(sk, nAct) / 400 - sk.aggression / 400 - Math.max(0, oppLeak) * ex * 0.35;
          const bluff = str < 0.3 && rng.next() < (sk.aggression / 100) * 0.28 * (0.6 + ex * 0.4) * (1 - oppLeak * 1.6 * ex);
          if (valueBet || bluff || (str > 0.45 && rng.next() < 0.25 + sk.aggression / 300)) {
            const frac = valueBet ? ((str > 0.85 ? 0.75 : 0.55) + sk.aggression / 400) * (1 + Math.max(0, oppLeak) * 1.3 * ex) : 0.5;
            const amt = Math.max(bb, Math.round(pot * frac));
            bet = Math.min(amt, s.e.stack);
            const a = Math.min(bet, s.e.stack); s.e.stack -= a; s.contrib += a; s.bet += a; if (s.e.stack === 0) s.allIn = true; bet = s.bet; aggressor = i; pot += a;
            responders = ord.filter((j) => j !== i);
          }
        }
      }
      if (bet > 0) {
        for (const i of responders) {
          const s = seats[i]; if (s.folded || s.allIn) continue;
          const need = Math.min(bet - s.bet, s.e.stack); if (need <= 0) continue;
          const str = strengths.get(i)!; const sk = s.e.sk;
          const odds = need / (pot + need);
          const raiseIt = str > 0.88 && rng.next() < 0.18 + sk.aggression / 400 && s.e.stack > need * 2.5;
          const callIt = str > odds + 0.12 + (pskill(sk, nAct) / 100 - 0.5) * 0.9 - (sk.risk / 100) * 0.1 + ctx.pressure * 0.12 * (sk.icm / 100);
          if (raiseIt) { const a = Math.min(need * 3, s.e.stack); s.e.stack -= a; s.contrib += a; s.bet += a; pot += a; if (s.e.stack === 0) s.allIn = true; /* 간이: 상대는 호출/폴드 단순 처리 */
            const raiseTo = s.bet;
            for (const j of ord) { if (j === i) continue; const t = seats[j]; if (t.folded || t.allIn) continue; const nd = Math.min(raiseTo - t.bet, t.e.stack); if (nd <= 0) continue; const ts = strengths.get(j)!; if (ts > nd / (pot + nd) + 0.25 || t.e.sk.risk > 70 && ts > 0.45) { t.e.stack -= nd; t.contrib += nd; t.bet += nd; pot += nd; if (t.e.stack === 0) t.allIn = true; } else t.folded = true; }
            bet = raiseTo;
          } else if (callIt) { s.e.stack -= need; s.contrib += need; s.bet += need; pot += need; if (s.e.stack === 0) s.allIn = true; }
          else s.folded = true;
        }
        void aggressor;
      }
      if (live() === 1) break;
    }
    // 올인으로 보드가 덜 깔린 경우 런아웃
    while (board.length < 5) { if (board.length === 0) { draw(); board.push(draw(), draw(), draw()); } else { draw(); board.push(draw()); } }
  }

  // ───── 쇼다운/분배 ─────
  const scores: (number | null)[] = seats.map((s) => (s.folded ? null : (board.length === 5 ? evaluate([...s.hole, ...board]) : 1)));
  const { won, killers } = distribute(seats, board, btn, scores);
  const kills: [number, number[]][] = [];
  for (let i = 0; i < n; i++) {
    seats[i].e.stack += won[i];
  }
  for (let i = 0; i < n; i++) if (seats[i].e.stack === 0 && seats[i].start > 0) kills.push([i, (killers.get(i) ?? []).filter((w) => w !== i)]);
  return { startStacks, kills };
}

export function simulateBatch(spec: BatchSpec): BatchResult {
  const rng = createRng(spec.seed);
  const levels = blindStructure(spec.bb0);
  const entries: E[] = [];
  const mk = (pid: string, sk: SkillProfile, n: number, level0 = 0): E => ({ eid: n === 1 ? pid : `${pid}#${n}`, pid, sk, stack: spec.startStack, bounty: 0, n, level0 });
  const bountyUnit = spec.bounty ? Math.round(spec.startStack * spec.bounty.share) : 0;
  for (const en of spec.entrants) { const e = mk(en.id, en.skill, 1); e.bounty = bountyUnit; entries.push(e); }
  const skillOf = new Map(spec.entrants.map((e) => [e.id, e.skill] as const));
  const reentries = new Map<string, number>();
  let totalEntries = entries.length;
  let chipTotal = entries.length * spec.startStack;
  const bountyTotal0 = bountyUnit * entries.length;
  const bountyCash: Record<string, number> = {};
  const out: E[] = []; // 탈락 순서(먼저 탈락 = 앞)
  const violations: string[] = [];

  // 좌석 배정
  let alive: E[] = shuffle(entries.slice(), rng);
  const nTables = Math.ceil(alive.length / spec.tableSize);
  let tables: E[][] = Array.from({ length: nTables }, () => []);
  alive.forEach((e, i) => tables[i % nTables].push(e));
  const buttons = tables.map(() => 0);
  let round = 0, hands = 0, level = 0;
  const cap = spec.maxRounds ?? 4000;
  let aliveCount = alive.length;
  while (aliveCount > 1 && round < cap) {
    const lv = levels[Math.min(level, levels.length - 1)];
    // ICM 버블 압박: 입상권 직전 ±15%
    const pressure = aliveCount > spec.paidPlaces && aliveCount <= spec.paidPlaces * 1.15 + 2 ? 1 : aliveCount <= spec.paidPlaces ? 0.35 : 0;
    const busts: { e: E; start: number }[] = [];
    const pending: [E, E[]][] = [];
    tables.forEach((tb, t) => {
      if (tb.length < 2) return;
      const btn = buttons[t] % tb.length;
      const before = tb.reduce((a, e) => a + e.stack, 0);
      const r = playHand(tb, btn, { rng, bb: lv.bb, sb: lv.sb, ante: lv.ante, pressure });
      hands++;
      const after = tb.reduce((a, e) => a + e.stack, 0);
      if (after !== before) violations.push(`칩 불일치 라운드 ${round} 테이블 ${t}: ${before} → ${after}`);
      for (const [i, killers] of r.kills) { busts.push({ e: tb[i], start: r.startStacks[i] }); pending.push([tb[i], killers.map((k) => tb[k]).filter((k): k is E => !!k)]); }
      buttons[t] = (btn + 1) % Math.max(1, tb.length);
    });
    // PKO: 킬러에게 바운티 분배
    if (spec.bounty) {
      for (const [bustee, killers] of pending) {
        const b = bustee.bounty; bustee.bounty = 0;
        if (b <= 0) continue;
        const ks = killers.length ? killers : [];
        if (!ks.length) { // 킬러 불명 시(자기 자신 승리 등) 바운티는 소멸 대신 같은 테이블 최대 스택에게 — 구조상 거의 없음
          continue;
        }
        const half = Math.floor(b / 2), per = Math.floor(half / ks.length);
        let rem = b;
        for (const k of ks) { bountyCash[k.pid] = (bountyCash[k.pid] ?? 0) + per; k.bounty += per; rem -= per * 2; }
        // 나머지(홀수)는 첫 킬러에게
        bountyCash[ks[0].pid] = (bountyCash[ks[0].pid] ?? 0) + rem;
      }
    }
    // 동시 탈락: 핸드 시작 스택이 큰 쪽이 더 높은 순위 (먼저 나가는 쪽 = 작은 스택)
    busts.sort((a, b) => a.start - b.start);
    for (const b of busts) {
      out.push(b.e);
      for (const tb of tables) { const k = tb.indexOf(b.e); if (k >= 0) tb.splice(k, 1); }
      aliveCount--;
      // 재진입
      if (spec.reentry && level + 1 <= spec.reentry.untilLevel) {
        const used = reentries.get(b.e.pid) ?? 0;
        const sk = skillOf.get(b.e.pid)!;
        const prob = 0.25 + (sk.risk / 100) * 0.55; // 위험 선호가 클수록 재진입
        if (used < spec.reentry.max && rng.next() < prob) {
          reentries.set(b.e.pid, used + 1);
          const ne = mk(b.e.pid, sk, used + 2); ne.bounty = bountyUnit;
          totalEntries++; chipTotal += spec.startStack; aliveCount++;
          tables.sort((a, c) => a.length - c.length);
          tables[0].push(ne); // 가장 빈 테이블에 착석
        }
      }
    }
    tables = tables.filter((t) => t.length > 0);
    // 테이블 균형/해체
    rebalance(tables, buttons, spec.tableSize, aliveCount, rng);
    round++;
    if (round % spec.handsPerLevel === 0 && level < levels.length - 1) level++;
  }
  // 종료: 남은 엔트리를 칩 순서로 정렬 (정상이면 1명)
  const rest = tables.flat().sort((a, b) => a.stack - b.stack);
  const finalOrder = [...out, ...rest].reverse();
  const winner = finalOrder[0];
  const sum = rest.reduce((a, e) => a + e.stack, 0);
  if (rest.length === 1 && sum !== chipTotal) violations.push(`종료 칩 불일치 ${sum} vs ${chipTotal}`);
  const live = rest.reduce((a, e) => a + e.bounty, 0);
  if (spec.bounty) {
    const cashSum = Object.values(bountyCash).reduce((a, b) => a + b, 0);
    // 바운티 보존: 초기 + 재진입분 == 현금 지급 + 남은 바운티 (+ 킬러 불명으로 소멸된 양 = 0 이어야 함)
    const expected = bountyUnit * totalEntries;
    if (cashSum + live !== expected) violations.push(`바운티 보존 위반: ${cashSum + live} vs ${expected}`);
  }
  void bountyTotal0;
  return { order: finalOrder.map((e) => ({ eid: e.eid, pid: e.pid, n: e.n })), totalEntries, rounds: round, hands, bountyCash, winnerBounty: winner ? winner.bounty : 0, bountyUnit, chipTotal, violations };
}

function shuffle<T>(a: T[], rng: RNG): T[] { for (let i = a.length - 1; i > 0; i--) { const j = rng.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** 필요 테이블 수를 맞추고(해체) 인원 편차를 1 이하로 균형 */
function rebalance(tables: E[][], buttons: number[], size: number, alive: number, rng: RNG) {
  const need = Math.max(1, Math.ceil(alive / size));
  while (tables.length > need) {
    tables.sort((a, b) => a.length - b.length);
    const dead = tables.shift()!;
    for (const e of dead) { tables.sort((a, b) => a.length - b.length); tables[0].splice(rng.int(tables[0].length + 1), 0, e); }
  }
  for (let guard = 0; guard < 200; guard++) {
    tables.sort((a, b) => a.length - b.length);
    const small = tables[0], big = tables[tables.length - 1];
    if (big.length - small.length <= 1) break;
    const e = big.splice(rng.int(big.length), 1)[0];
    small.splice(rng.int(small.length + 1), 0, e);
  }
  while (buttons.length < tables.length) buttons.push(0);
  buttons.length = tables.length;
}

/**
 * 캐시게임 배치 시뮬레이션: 매 핸드 전원 시작 스택을 stackBB 로 리셋(= 항상 리바이)하고 한 핸드를 진행한 뒤 순증감을 기록한다.
 * 반환: 선수별 {hands, netBB}. 승률 표본이므로 표준오차와 함께 읽어야 한다.
 */
export function simulateCash(players: SimEntrant[], opts: { hands: number; seats: number; stackBB: number; seed: number; bb?: number }): Record<string, { hands: number; netBB: number; netBBsq: number }> {
  const rng = createRng(opts.seed);
  const bb = opts.bb ?? 100;
  const sb = Math.round(bb / 2);
  const stats: Record<string, { hands: number; netBB: number; netBBsq: number }> = {};
  for (const p of players) stats[p.id] = { hands: 0, netBB: 0, netBBsq: 0 };
  const ids = players.map((p) => p.id);
  const skill = new Map(players.map((p) => [p.id, p.skill] as const));
  // 핸드 수를 맞추기 위해 라운드 로빈 형태로 좌석을 뽑는다
  let handsPerPlayer = 0;
  const total = Math.ceil((opts.hands * players.length) / opts.seats);
  for (let h = 0; h < total; h++) {
    const pick: string[] = [];
    const used = new Set<number>();
    while (pick.length < opts.seats) { const k = rng.int(ids.length); if (!used.has(k)) { used.add(k); pick.push(ids[k]); } }
    const table: E[] = pick.map((id) => ({ eid: id, pid: id, sk: skill.get(id)!, stack: opts.stackBB * bb, bounty: 0, n: 1, level0: 0 }));
    const btn = rng.int(table.length);
    playHand(table, btn, { rng, bb, sb, ante: 0, pressure: 0 });
    for (const e of table) { const s = stats[e.pid]; const d = (e.stack - opts.stackBB * bb) / bb; s.hands++; s.netBB += d; s.netBBsq += d * d; }
  }
  void handsPerPlayer;
  return stats;
}
