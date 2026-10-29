/**
 * 공식 AI 세계 시즌 계산기 (오프라인 빌드 스크립트와 테스트가 호출). 결정론적: 같은 시드 → 같은 스냅샷.
 * 앱은 계산하지 않고 `data/season.json` 스냅샷을 날짜에 맞춰 공개한다 ("백그라운드에서 실시간 진행 중"이라고 주장하지 않는다).
 */
import { createRng, RNG } from '../engine/rng';
import { simulateBatch, simulateCash, SimEntrant } from './batch';
import { amateur, ALL_RANKED, hash, Roster } from './field';
import { EVENT_TEMPLATES, EventDef, SEASONS, SEASON_GROWTH, eventKey, seriesById, venueById } from './calendar';
import { absDay, ageWeight, eventPoints } from './points';
import { bracketGroups, paidPlacesOf, prizeFor, prizeStructure, sharePrizes } from './prizes';
import { HANDS_PER_LEVEL } from '../game/session';
import type { SkillProfile } from './cast';

export interface Finisher { id: string; name: string; nat: string; place: number; prize: number; bounty?: number; ranked: boolean }
export interface EventResult {
  key: string; season: number; id: string; day: number;
  /** 서로 다른 참가자 수 / 총 엔트리(재진입 포함) */
  players: number; entries: number;
  prizePool: number; overlay: number; paid: number; bountyPool: number;
  tickets: number; ticketValue: number;
  winnerId: string; winnerName: string;
  hands: number; rounds: number;
  top: Finisher[];
  /** 랭킹 풀 참가자: [roster index, 최고 순위, 엔트리 수, 총 획득(상금+바운티+티켓 환산)] */
  ranked: [number, number, number, number][];
  /** 헤즈업/슛아웃 전적: [승자 idx, 패자 idx] (랭킹 풀끼리만) */
  matches?: [number, number][];
  /** 새틀라이트 티켓 수령자(랭킹 풀 index) */
  ticketHolders?: number[];
}
export interface CashRow { idx: number; hands: number; bb100: number; se: number }
export interface HuRow { idx: number; matches: number; wins: number }
export interface WorldSnapshot { version: 1; seed: number; roster: string[]; events: EventResult[]; cash: CashRow[]; hu: HuRow[]; generatedFor: string }

const TIER_IDX: Record<string, number> = { free: 0, micro: 1, low: 2, mid: 3, high: 4, super: 5, ultra: 6 };
const AMATEUR_MEAN: Record<string, number> = { free: 38, micro: 42, low: 46, mid: 51, high: 57, super: 62, ultra: 66 };
const LEGEND_AVAIL: Record<string, number> = { free: 0, micro: 0.05, low: 0.15, mid: 0.4, high: 0.7, super: 0.85, ultra: 0.95 }; // 실존 레전드는 투어를 도는 프로: 중·고액 이벤트에 자주 나온다
const FUTURE_AVAIL: Record<string, number> = { free: 0.3, micro: 0.35, low: 0.45, mid: 0.5, high: 0.4, super: 0.25, ultra: 0.15 };
const ROSTER_AVAIL: Record<string, number> = { free: 0.4, micro: 0.5, low: 0.5, mid: 0.4, high: 0.1, super: 0.02, ultra: 0 };

const avgSkill = (s: SkillProfile) => (s.preflop + s.postflop + s.icm + s.exploit) / 4;

function fit(r: Roster, def: EventDef): number {
  const n = r.named; if (!n) return 1;
  const v = venueById(def.venueId); const sr = seriesById(def.seriesId);
  const hay = `${sr.nameEn} ${sr.name} ${v.cityEn} ${v.city} ${def.tags.join(' ')} ${def.kind === 'hu' ? 'Heads-Up' : ''} ${def.pko ? 'PKO' : ''} ${def.speed === 'turbo' || def.speed === 'hyper' ? 'Turbo' : ''} ${def.buyIn >= 3000 ? 'High Roller' : ''}`.toLowerCase();
  return n.venuePreference.some((p) => hay.includes(p.toLowerCase())) ? 2.6 : 1;
}

function weightOf(r: Roster, def: EventDef): number {
  const tier = def.tier; const v = venueById(def.venueId);
  let w: number;
  if (r.named?.kind === 'real_legacy') w = LEGEND_AVAIL[tier] * (0.5 + 0.12 * def.prestige);
  else if (r.named?.kind === 'fictional_2035') w = FUTURE_AVAIL[tier];
  else if (r.named?.kind === 'roster') w = ROSTER_AVAIL[tier];
  else {
    const reg = r.region === v.region ? 1 : r.region === 'GLOBAL' ? 0.5 : v.domestic ? 0.12 : 0.3;
    const skillBias = Math.exp(((avgSkill(r.skill) - 50) / 12) * TIER_IDX[tier] * 0.25);
    w = 0.5 * reg * skillBias;
  }
  if (r.named) w *= (r.region === v.region || r.named.kind === 'real_legacy' ? 1 : 0.6) * fit(r, def);
  return w;
}

function weightedSample(rng: RNG, items: Roster[], weights: number[], k: number): Roster[] {
  const keyed = items.map((it, i) => ({ it, key: weights[i] > 0 ? -Math.log(Math.max(1e-12, rng.next())) / weights[i] : Infinity })).filter((x) => x.key !== Infinity);
  keyed.sort((a, b) => a.key - b.key);
  return keyed.slice(0, k).map((x) => x.it);
}

interface Standings { domestic: Map<string, number>; global: Map<string, number> }

export function buildField(def: EventDef, season: number, rng: RNG, st: Standings): { entrants: { id: string; name: string; nat: string; skill: SkillProfile; ranked: boolean; idx: number }[] } {
  const growth = SEASON_GROWTH[season] ?? 1;
  let n = def.invite ? def.field : Math.max(def.kind === 'hu' ? 16 : 8, Math.round(def.field * growth));
  if (def.kind === 'hu') n = Math.pow(2, Math.round(Math.log2(n)));
  if (def.kind === 'shootout') n = Math.max(def.tableSize, Math.round(n / def.tableSize) * def.tableSize);
  const idxOf = new Map(ALL_RANKED.map((r, i) => [r.id, i] as const));
  const chosen: Roster[] = [];
  if (def.invite === 'legends') {
    // 레전드 72명 전원을 한 대회에 몰지 않는다: 명성(실력 평균)에 비례한 시즌별 초청 30명
    const legs = ALL_RANKED.filter((r) => r.named?.kind === 'real_legacy');
    for (const r of weightedSample(rng, legs, legs.map((r) => Math.exp((avgSkill(r.skill) - 60) / 12)), Math.min(30, legs.length))) chosen.push(r);
  }
  if (def.invite) {
    const pool = ALL_RANKED.filter((r) => !chosen.includes(r));
    const source = def.invite === 'top-domestic' ? pool.filter((r) => r.nationality === '대한민국') : pool;
    const score = (r: Roster) => (def.invite === 'top-domestic' ? st.domestic.get(r.id) : st.global.get(r.id)) ?? 0;
    const sorted = source.map((r) => ({ r, s: score(r) + avgSkill(r.skill) * 0.01 + rng.next() * 0.001 })).sort((a, b) => b.s - a.s).map((x) => x.r);
    for (const r of sorted) { if (chosen.length >= n) break; chosen.push(r); }
  } else {
    const rankedTarget = Math.min(n, Math.max(8, Math.round(Math.min(n * 0.6, 160 + 18 * TIER_IDX[def.tier]))));
    const w = ALL_RANKED.map((r) => weightOf(r, def));
    for (const r of weightedSample(rng, ALL_RANKED, w, rankedTarget)) chosen.push(r);
  }
  const entrants = chosen.slice(0, n).map((r) => ({ id: r.id, name: r.name, nat: r.nationality, skill: r.skill, ranked: true, idx: idxOf.get(r.id)! }));
  const regionBias = venueById(def.venueId).region;
  for (let i = 0; entrants.length < n; i++) {
    const a = amateur(`${season}:${def.id}`, i, regionBias, AMATEUR_MEAN[def.tier]);
    entrants.push({ id: a.id, name: a.name, nat: a.nationality, skill: a.skill, ranked: false, idx: -1 });
  }
  // 좌석 추첨 순서를 위해 섞는다
  for (let i = entrants.length - 1; i > 0; i--) { const j = rng.int(i + 1); [entrants[i], entrants[j]] = [entrants[j], entrants[i]]; }
  return { entrants };
}

export function simulateEvent(def: EventDef, season: number, st: Standings, targets: Map<string, EventDef>): EventResult {
  const key = eventKey(season, def.id);
  const rng = createRng(hash(`world:${key}`));
  const { entrants } = buildField(def, season, rng, st);
  const info = new Map(entrants.map((e) => [e.id, e] as const));
  const sim: SimEntrant[] = entrants.map((e) => ({ id: e.id, skill: e.skill }));
  const startStack = def.stackBB * def.bb0;
  const hpl = HANDS_PER_LEVEL[def.speed];
  const target = def.satelliteFor ? targets.get(def.satelliteFor) : undefined;
  let order: { eid: string; pid: string; n: number }[] = [];
  let totalEntries = sim.length;
  let hands = 0, rounds = 0;
  let bountyCash: Record<string, number> = {};
  let tieGroups: number[][] | null = null;
  const matches: [number, number][] = [];
  let ps = prizeStructure(def, sim.length, target?.buyIn);

  if (def.kind === 'hu') {
    let alive = sim.map((s) => s.id);
    const loserRounds: string[][] = [];
    let matchSeed = hash(key);
    while (alive.length > 1) {
      const next: string[] = []; const losers: string[] = [];
      for (let i = 0; i < alive.length; i += 2) {
        const a = info.get(alive[i])!, b = info.get(alive[i + 1])!;
        const r = simulateBatch({ entrants: [{ id: a.id, skill: a.skill }, { id: b.id, skill: b.skill }], startStack, bb0: def.bb0, tableSize: 2, handsPerLevel: hpl, paidPlaces: 1, seed: matchSeed++ });
        const w = r.order[0].pid, l = r.order[1].pid;
        hands += r.hands; rounds += r.rounds;
        next.push(w); losers.push(l);
        const wi = info.get(w)!, li = info.get(l)!;
        if (wi.ranked && li.ranked) matches.push([wi.idx, li.idx]);
      }
      loserRounds.push(losers);
      alive = next;
    }
    // 순서: 우승, 결승 패자, 준결승 패자들 …
    order = [{ eid: alive[0], pid: alive[0], n: 1 }];
    for (let r = loserRounds.length - 1; r >= 0; r--) for (const l of loserRounds[r]) order.push({ eid: l, pid: l, n: 1 });
    tieGroups = bracketGroups(loserRounds.length);
  } else if (def.kind === 'shootout') {
    let alive = sim.slice();
    const out: SimEntrant[][] = [];
    let seed = hash(key);
    while (alive.length > def.tableSize) {
      const winners: SimEntrant[] = []; const lost: SimEntrant[] = [];
      for (let i = 0; i < alive.length; i += def.tableSize) {
        const grp = alive.slice(i, i + def.tableSize);
        if (grp.length < 2) { winners.push(...grp); continue; }
        const r = simulateBatch({ entrants: grp, startStack, bb0: def.bb0, tableSize: def.tableSize, handsPerLevel: hpl, paidPlaces: 1, seed: seed++ });
        hands += r.hands; rounds += r.rounds;
        const w = grp.find((g) => g.id === r.order[0].pid)!;
        winners.push(w);
        for (const o of r.order.slice(1)) lost.push(grp.find((g) => g.id === o.pid)!);
        const wi = info.get(w.id)!; for (const o of r.order.slice(1)) { const li = info.get(o.pid)!; if (wi.ranked && li.ranked) matches.push([wi.idx, li.idx]); }
      }
      out.push(lost);
      alive = winners;
    }
    const fin = simulateBatch({ entrants: alive, startStack, bb0: def.bb0, tableSize: def.tableSize, handsPerLevel: hpl, paidPlaces: Math.min(ps.paid, alive.length), seed: seed++ });
    hands += fin.hands; rounds += fin.rounds;
    order = fin.order.map((o) => ({ eid: o.pid, pid: o.pid, n: 1 }));
    const grpPlaces: number[][] = fin.order.map((_, i) => [i + 1]);
    let pos = fin.order.length + 1;
    for (let r = out.length - 1; r >= 0; r--) {
      const g: number[] = []; for (const l of out[r]) { order.push({ eid: l.id, pid: l.id, n: 1 }); g.push(pos++); }
      grpPlaces.push(g);
    }
    tieGroups = grpPlaces;
    ps = prizeStructure({ ...def, paidPct: Math.min(0.5, def.tableSize / sim.length) }, sim.length, target?.buyIn);
  } else {
    const res = simulateBatch({
      entrants: sim, startStack, bb0: def.bb0, tableSize: def.tableSize, handsPerLevel: hpl,
      reentry: def.reentry, bounty: def.pko ? { share: def.pko.share } : undefined,
      paidPlaces: Math.max(1, ps.paid || Math.round(sim.length * 0.15)), seed: hash(key),
    });
    if (res.violations.length) throw new Error(`${key}: 시뮬레이션 불변식 위반: ${res.violations[0]}`);
    order = res.order; totalEntries = res.totalEntries; hands = res.hands; rounds = res.rounds;
    bountyCash = res.bountyCash;
    if (totalEntries !== sim.length) ps = prizeStructure(def, totalEntries, target?.buyIn);
  }

  // 순위별 상금: 엔트리 단위 (재진입 엔트리 각자 순위)
  let prizeByPlace: number[];
  if (tieGroups) { prizeByPlace = sharePrizes(ps, tieGroups); }
  else prizeByPlace = Array.from({ length: order.length }, (_, i) => prizeFor(ps, i + 1));
  // 새틀라이트: 티켓 수령자
  const ticketHolders: number[] = [];
  const perPlayer = new Map<string, { best: number; entries: number; won: number }>();
  const top: Finisher[] = [];
  order.forEach((o, i) => {
    const place = i + 1;
    let prize = prizeByPlace[i] ?? 0;
    let ticketVal = 0;
    if (def.kind === 'satellite') {
      if (place <= ps.tickets) { ticketVal = ps.ticketValue; const idx = info.get(o.pid)!.idx; if (idx >= 0) ticketHolders.push(idx); }
      else if (place === ps.tickets + 1) prize = ps.ticketCashRemainder;
    }
    const cur = perPlayer.get(o.pid) ?? { best: place, entries: 0, won: 0 };
    cur.best = Math.min(cur.best, place); cur.entries++; cur.won += prize + ticketVal;
    perPlayer.set(o.pid, cur);
    const inf = info.get(o.pid)!;
    if (top.length < 40 && (place <= Math.max(ps.paid, ps.tickets + 1) || place <= 10)) top.push({ id: inf.id, name: inf.name, nat: inf.nat, place, prize: prize + ticketVal, ranked: inf.ranked });
  });
  const ranked: EventResult['ranked'] = [];
  let bountyTotalCash = 0;
  for (const [pid, v] of perPlayer) {
    const inf = info.get(pid)!;
    const b = bountyCash[pid] ?? 0; bountyTotalCash += b;
    if (inf.ranked) ranked.push([inf.idx, v.best, v.entries, v.won + b]);
    for (const t of top) if (t.id === pid && !t.bounty && b) t.bounty = b;
  }
  void bountyTotalCash;
  const w = info.get(order[0].pid)!;
  return {
    key, season, id: def.id, day: def.day, players: sim.length, entries: totalEntries, prizePool: ps.prizePool, overlay: ps.overlay, paid: tieGroups ? paidPlacesOf(def, sim.length, target?.buyIn ?? 0) : ps.paid,
    bountyPool: ps.bountyPool, tickets: ps.tickets, ticketValue: ps.ticketValue, winnerId: w.id, winnerName: w.name, hands, rounds, top,
    ranked, ...(matches.length ? { matches } : {}), ...(ticketHolders.length ? { ticketHolders } : {}),
  };
}

export function buildWorld(opts: { seed?: number; cashHands?: number; huMatches?: number; seasons?: readonly number[]; quick?: boolean } = {}): WorldSnapshot {
  const seasons = opts.seasons ?? SEASONS;
  const events: EventResult[] = [];
  const st: Standings = { domestic: new Map(), global: new Map() };
  const targets = new Map(EVENT_TEMPLATES.map((e) => [e.id, e] as const));
  const idOf = ALL_RANKED.map((r) => r.id);
  for (const season of seasons) {
    const sched = [...EVENT_TEMPLATES].sort((a, b) => a.day - b.day);
    for (const def of sched) {
      if (opts.quick && def.field > 400) continue;
      const res = simulateEvent(def, season, st, targets);
      events.push(res);
      // 초청 자격용 누적 포인트 (간이: 최근 점수 합)
      const dom = venueById(def.venueId).domestic;
      for (const [idx, best, , ] of res.ranked) {
        const pts = eventPoints(def, best, res.paid, res.entries);
        const id = idOf[idx];
        st.global.set(id, (st.global.get(id) ?? 0) + pts);
        if (dom) st.domestic.set(id, (st.domestic.get(id) ?? 0) + pts);
      }
    }
  }
  // 캐시게임 장기 성과
  const cashHands = opts.cashHands ?? 3000;
  const sims: SimEntrant[] = ALL_RANKED.map((r) => ({ id: r.id, skill: r.skill }));
  const cs = simulateCash(sims, { hands: cashHands, seats: 6, stackBB: 100, seed: 777 });
  const cash: CashRow[] = ALL_RANKED.map((r, idx) => {
    const s = cs[r.id]; const mean = s.netBB / s.hands; const varr = Math.max(0, s.netBBsq / s.hands - mean * mean);
    return { idx, hands: s.hands, bb100: Math.round(mean * 1000) / 10, se: Math.round(Math.sqrt(varr / s.hands) * 1000) / 10 };
  });
  // 헤즈업 사다리
  const huN = opts.huMatches ?? 8000;
  const hrng = createRng(4242);
  const wins = new Array(ALL_RANKED.length).fill(0), games = new Array(ALL_RANKED.length).fill(0);
  for (let k = 0; k < huN; k++) {
    const a = hrng.int(ALL_RANKED.length); let b = hrng.int(ALL_RANKED.length - 1); if (b >= a) b++;
    const r = simulateBatch({ entrants: [{ id: 'a', skill: ALL_RANKED[a].skill }, { id: 'b', skill: ALL_RANKED[b].skill }], startStack: 5000, bb0: 100, tableSize: 2, handsPerLevel: 8, paidPlaces: 1, seed: 9000 + k });
    games[a]++; games[b]++; wins[r.order[0].pid === 'a' ? a : b]++;
  }
  const hu: HuRow[] = ALL_RANKED.map((_, idx) => ({ idx, matches: games[idx], wins: wins[idx] }));
  // 이벤트 내 HU/슛아웃 전적도 합산
  for (const e of events) for (const [w, l] of e.matches ?? []) { const row = hu[w]; row.wins++; row.matches++; hu[l].matches++; }
  return { version: 1, seed: opts.seed ?? 2035, roster: idOf, events, cash, hu, generatedFor: '2033-2035 공식 AI 세계(가상)' };
}
