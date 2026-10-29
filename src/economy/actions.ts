import { AI_LEVELS } from '../ai/profiles';
import { OppModel } from '../ai/opponentModel';
import { createRng } from '../engine/rng';
import { beginHand, newSession, rebuy, Session, SessionConfig } from '../game/session';
import { newMTTSession, heroBountyCash } from '../game/mtt';
import { worldOpponents } from '../world/personal';
import { templateById } from '../world/calendar';
import { ticketsFor } from '../world/prizes';
import { CashTable, entryCost, levelDifficulty, LevelId, prizePoolOf, sngPrizeTable, TournamentDef } from './catalog';
import { pickOpponents } from './roster';
import * as W from './wallet';

export interface Launch { session: Session; wallet: W.Wallet }

export const newSid = (): string => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `s${Date.now()}${Math.floor(Math.random() * 1e9)}`);
const levelDiff = (id: LevelId) => levelDifficulty(id);

// ───────── 캐시게임 ─────────
export function launchCash(wallet: W.Wallet, table: CashTable, buyIn: number, level: LevelId, memory: OppModel, seed: number, sid = newSid(), humanName = 'TETO', now = Date.now()): Launch {
  const practice = table.id === 'practice';
  const w = practice ? W.openPractice(wallet, sid, table.name, now) : W.openCash(wallet, sid, table.name, buyIn, { min: table.minBuy, max: table.maxBuy }, now);
  const opps = pickOpponents(table.seats - 1, seed);
  const d = levelDiff(level);
  const cfg: SessionConfig = {
    mode: 'cash', seats: table.seats, startBB: Math.max(1, Math.round(buyIn / table.bb)), bb: table.bb, buyInChips: buyIn, speed: 'normal', humanName, seed,
    ais: opps.map((o) => ({ profileId: o.profileId, difficulty: d })), aiNames: opps.map((o) => o.name), aiIds: opps.map((o) => o.id),
    cash: { tableId: table.id, label: table.name, min: table.minBuy, max: table.maxBuy },
  };
  let s = newSession(cfg);
  s = { ...s, sid, memory: structuredClone(memory) };
  s = beginHand(s, createRng(seed ^ 0x9e3779b1));
  return { session: s, wallet: w };
}

/** 테이블에서 일어난다: 남은 테이블 칩만 통장으로 돌아온다. 핸드가 진행 중이면 거부(칩이 팟에 묶여 있음). */
export function leaveCash(wallet: W.Wallet, session: Session, now = Date.now()): W.Wallet {
  if (!session.sid) return wallet;
  if (session.game.street !== 'complete') throw new Error('핸드가 끝난 뒤에 나갈 수 있습니다');
  const hero = session.game.players.find((p) => p.isHuman)!;
  const a = wallet.accounts[session.sid];
  if (a?.kind === 'practice') return W.closePractice(wallet, session.sid, now);
  return W.closeCash(wallet, session.sid, hero.stack, now);
}

/** 캐시 리바이/탑업: 통장에서 차감하고 테이블 칩을 늘린다. 같은 핸드 사이의 중복 클릭은 한 번만 처리. */
export function cashRebuy(wallet: W.Wallet, session: Session, amount: number, now = Date.now()): Launch {
  const sid = session.sid;
  const cash = session.config.cash;
  if (!sid || !cash) throw new Error('캐시게임이 아닙니다');
  const heroSeat = session.game.players.findIndex((p) => p.isHuman);
  const hero = session.game.players[heroSeat];
  const acct = wallet.accounts[sid];
  if (acct?.kind === 'practice') { // 연습: 통장 무관, 스택 상한만 적용
    const add = Math.min(amount, cash.max - hero.stack);
    if (add <= 0) throw new Error('이미 최대 바이인입니다');
    return { session: rebuy(session, heroSeat, add), wallet };
  }
  const opId = `h${session.game.handNo}`;
  const w2 = W.cashTopUp(wallet, sid, opId, amount, { max: cash.max, currentChips: hero.stack }, now);
  if (w2 === wallet) return { session, wallet }; // 이미 처리된 요청
  return { session: rebuy(session, heroSeat, amount), wallet: w2 };
}

// ───────── 토너먼트 ─────────
export function launchTournament(wallet: W.Wallet, def: TournamentDef, level: LevelId, memory: OppModel, seed: number, opts: { sid?: string; blindMode?: 'regular' | 'adaptive'; speed?: TournamentDef['speed']; humanName?: string; now?: number; ticket?: boolean } = {}): Launch {
  const sid = opts.sid ?? newSid();
  const now = opts.now ?? Date.now();
  const humanName = opts.humanName ?? 'TETO';
  const w = W.enterTournament(wallet, sid, { id: def.id, name: def.name, buyIn: def.buyIn, fee: def.fee }, def.group === 'free' ? 'freeroll' : 'tournament', now, !!opts.ticket);
  const d = levelDiff(level);
  const blindMode = opts.blindMode ?? def.blindMode;
  const speed = opts.speed ?? def.speed;
  let s: Session;
  if (def.kind === 'mtt') {
    const ev = def.world ? templateById(def.world.eventId) : null;
    s = newMTTSession({
      startBB: def.startBB, bb: def.bb, speed, humanName, seed, difficulty: d, profileId: 'AdaptivePro', blindMode,
      opponents: ev ? worldOpponents(ev, def.world!.season, seed, def.entrants) : undefined,
      mtt: {
        entrants: def.entrants, tableSize: def.tableSize as 6 | 9, buyIn: def.buyIn, reentry: !!def.reentry, reentryUntilLevel: ev?.reentry?.untilLevel ?? def.lateRegUntilLevel ?? 4, maxReentries: def.reentryMax ?? 2,
        lateRegUntilLevel: def.lateRegUntilLevel, lateRegPerRound: def.lateRegPerRound, aiReentry: def.aiReentry,
        fast: def.entrants > 120, bounty: def.bounty, world: def.world ? { eventId: def.world.eventId } : undefined,
      },
    });
  } else {
    const opps = pickOpponents(def.tableSize - 1, seed);
    s = newSession({
      mode: def.kind === 'hu' ? 'headsup-sng' : 'sng', seats: def.tableSize, startBB: def.startBB, bb: def.bb, speed, humanName, seed, blindMode,
      ais: opps.map((o) => ({ profileId: o.profileId, difficulty: d })), aiNames: opps.map((o) => o.name), aiIds: opps.map((o) => o.id),
    });
    s = { ...s, prize: { pool: prizePoolOf(def), payouts: sngPrizeTable(def), buyIn: def.buyIn, fee: def.fee, name: def.name } };
  }
  s = { ...s, sid, tierId: def.id, memory: structuredClone(memory), config: { ...s.config, tierId: def.id } };
  s = beginHand(s, createRng(seed ^ 0x51ed270b));
  return { session: s, wallet: w };
}

/** 히어로의 최종 순위와 상금 (대회가 끝났거나 내가 탈락·재진입을 포기했을 때) */
export interface TResult { place: number; prize: number; field: number; bounty: number; ticket: { eventId: string; value: number } | null }
export function tournamentResult(session: Session): TResult | null {
  const hero = session.game.players.find((p) => p.isHuman);
  if (session.mtt) {
    const m = session.mtt;
    if (!(m.finished || (m.heroOut && !m.heroCanReenter))) return null;
    const place = m.places['hero'] ?? (m.winner === 'hero' ? 1 : m.totalEntries);
    let ticket: TResult['ticket'] = null;
    let prize = m.payouts[place - 1] ?? 0;
    if (m.config.world) {
      const ev = templateById(m.config.world.eventId);
      if (ev.kind === 'satellite') {
        const target = templateById(ev.satelliteFor!).buyIn;
        const n = ticketsFor(ev, m.totalEntries, target);
        if (place <= n) ticket = { eventId: ev.satelliteFor!, value: target };
        else if (place === n + 1) prize = prizeStructureRemainder(ev, m.totalEntries, target);
        else prize = 0;
      }
    }
    return { place, prize, field: m.totalEntries, bounty: heroBountyCash(m), ticket };
  }
  if (!hero) return null;
  const alive = !hero.busted && hero.stack > 0;
  // 탈락 순위는 탈락 순간에 확정된다 (대회 전체가 끝나길 기다리지 않는다 → ITM 탈락 즉시 상금)
  if (!(session.game.gameOver || (hero.busted && hero.finishPlace !== undefined))) return null;
  const place = alive ? 1 : hero.finishPlace ?? session.game.players.length;
  const payouts = session.prize?.payouts ?? [];
  return { place, prize: payouts[place - 1] ?? 0, field: session.game.players.length, bounty: 0, ticket: null };
}

/** 대회 정산: 상금을 통장에 한 번만 지급 (멱등) */
export function settleTournament(wallet: W.Wallet, session: Session, now = Date.now()): W.Wallet {
  if (!session.sid) return wallet;
  const r = tournamentResult(session);
  if (!r) return wallet;
  if (!wallet.accounts[session.sid]) return wallet; // 레거시(통장 미연동) 경기
  let w = W.payPrize(wallet, session.sid, r.prize, r.place, r.field, now, r.bounty);
  if (r.ticket) w = W.grantTicket(w, { id: `tk:${session.sid}`, eventId: r.ticket.eventId, season: 2035, value: r.ticket.value, sourceEntry: session.sid }, now);
  return w;
}

export function reenterEconomy(wallet: W.Wallet, session: Session, def: TournamentDef, now = Date.now()): Launch {
  if (!session.sid || !session.mtt) throw new Error('재진입할 수 없습니다');
  const entryNo = session.mtt.entries + 1;
  const w = W.reenterTournament(wallet, session.sid, { id: def.id, name: def.name, buyIn: def.buyIn, fee: def.fee }, entryNo, now);
  return { session, wallet: w };
}
export { entryCost };

// ───────── 정합성 복구 ─────────
/** 앱 시작 시: 저장된 세션과 연결되지 않은 열린 계정은 몰수(정산 없이 종료)한다. 새로고침/삭제로 손실을 되돌릴 수 없다. */
export function reconcile(wallet: W.Wallet, saved: Session | null): W.Wallet {
  let w = wallet;
  for (const a of Object.values(wallet.accounts)) {
    if (a.status === 'open' && (!saved || saved.sid !== a.id)) w = W.forfeit(w, a.id);
  }
  return w;
}
export { AI_LEVELS };

import { prizeStructure } from '../world/prizes';
function prizeStructureRemainder(ev: Parameters<typeof prizeStructure>[0], total: number, target: number): number { return prizeStructure(ev, total, target).ticketCashRemainder; }
