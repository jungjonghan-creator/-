import { create } from 'zustand';
import { Action, AllInAction, HandRecord } from '../engine/types';
import { randomSeed, createRng } from '../engine/rng';
import { mttReenter } from '../game/mtt';
import { mttAdvanceAsync, mttSimToEndAsync } from '../game/workerClient';
import { aiStep, beginHand, humanAct, isAITurn, newSession, rebuy, Session, SessionConfig, sessionOver, handOver } from '../game/session';
import { clearSession, importLegacyInto, loadKV, loadSession, loadWallet, saveAll, saveKV, useDbFor } from '../persist/db';
import { useAccount } from './useAccount';
import { remote, pack, unpack, RemoteError } from '../net/remote';
import { templateById } from '../world/calendar';
import { RULES_VERSION, HumanResult, isRankedEvent } from '../world/rankings';
import { prizeStructure } from '../world/prizes';
import { worldDay } from '../world/calendar';
import { sfx, setMuted } from '../sound';
import { tourneyAnnouncements, tourneyStatus } from '../game/tourney';
import { directHand, StoryLine } from '../story/director';
import { OppModel } from '../ai/opponentModel';
import * as W from '../economy/wallet';
import { cashRebuy, launchCash, launchTournament, leaveCash, newSid, reconcile, reenterEconomy, settleTournament, tournamentResult } from '../economy/actions';
import { cashTableById, LevelId, tournamentById } from '../economy/catalog';

export type Screen = 'menu' | 'table' | 'stats' | 'history' | 'trainer' | 'coach' | 'lobby' | 'wallet' | 'practice' | 'world' | 'ranking' | 'dex' | 'news' | 'account';

/** 마지막 정산 결과 (결과 화면은 서버/원장 확정 값만 표시) */
export interface Settlement { sid: string; place: number; prize: number; bounty: number; field: number; ticket: { eventId: string; value: number } | null; confirmedBy: 'server' | 'local'; ranked: boolean; points?: number; at: number }
export interface Settings { sound: boolean; animMs: number; revealAI: boolean; hints: boolean; autoCoach: boolean }
const DEFAULT_SETTINGS: Settings = { sound: true, animMs: 450, revealAI: false, hints: false, autoCoach: true };

export interface TourneyResult { tierId?: string; date: number; mode: string; entrants: number; place: number; prize: number; buyIn: number; entries: number }
export type RecordGroup = 'competitive' | 'training';
export const groupOf = (s: Session): RecordGroup => (s.config.mode === 'trainer' ? 'training' : 'competitive');

interface Store {
  // ── 영구 데이터 ──
  wallet: W.Wallet;
  walletErrors: string[] | null;
  memory: OppModel;
  archive: Record<RecordGroup, HandRecord[]>;
  tourneys: TourneyResult[];
  settings: Settings;
  /** 서버 계정으로 로그인한 온라인 모드 (지갑·정산은 서버 확정) */
  online: boolean;
  localRanked: HumanResult[];
  settlement: Settlement | null;
  settling: 'idle' | 'pending' | 'error';
  settleError: string | null;
  // ── 진행 중 ──
  session: Session | null;
  /** 저장소에서 불러온(아직 이어하지 않은) 세션 */
  saved: Session | null;
  screen: Screen;
  busy: boolean;
  skip: boolean;
  notice: string | null;
  corrupt: { errors: string[] } | null;
  ready: boolean;
  hasSave: boolean;

  recordsFor(g: RecordGroup): HandRecord[];
  init(): Promise<void>;
  skipAI(): void;
  setScreen(s: Screen): void;
  setSettings(p: Partial<Settings>): void;
  quit(): Promise<void>;
  resume(): Promise<void>;
  dismissCorrupt(): Promise<void>;
  resetWallet(): Promise<void>;
  clearNotice(): void;
  attachAccount(userId: string | null): Promise<void>;
  claimDaily(): Promise<string>;
  syncCloud(): Promise<void>;

  startCash(tableId: string, buyIn: number, level: LevelId): Promise<void>;
  startTournament(defId: string, level: LevelId, opts?: { blindMode?: 'regular' | 'adaptive'; speed?: SessionConfig['speed']; ticket?: boolean }): Promise<void>;
  /** 통장과 무관한 연습 경기 (기존 빠른 설정 화면) */
  startPractice(cfg: Omit<SessionConfig, 'seed'> & { seed?: number }): void;
  leaveTable(): Promise<void>;
  doRebuy(amount: number): Promise<void>;
  reenter(): Promise<void>;
  declineReentry(): void;
  simToEnd(): void;
  finalizeTourney(): Promise<void>;

  replaceSession(s: Session): void;
  act(a: Action | AllInAction, token: string): void;
  nextHand(): void;
}

let gen = 0;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const decisionToken = (s: Session) => `${s.game.handNo}:${s.game.events.length}`;
const isPractice = (s: Session) => !s.sid || s.config.cash?.tableId === 'practice' || (!s.config.cash && !s.tierId);

export const useGame = create<Store>((set, get) => {
  /** 상태를 저장한다. 세션과 통장은 한 트랜잭션. */
  let cloudTimer: ReturnType<typeof setTimeout> | null = null;
  let cloudVersion = -1;
  const pushCloud = async () => {
    if (!get().online) return;
    try {
      if (cloudVersion < 0) cloudVersion = (await loadKV<number>('cloudVersion')) ?? 0;
      const s = get().session ?? get().saved;
      const blob = await pack({ session: s, kv: { archive: get().archive, memory: get().memory, tourneys: get().tourneys }, savedAt: Date.now() });
      const r = await remote.savePut(cloudVersion, blob);
      cloudVersion = r.version; void saveKV('cloudVersion', r.version);
    } catch (e) {
      if ((e as RemoteError).code === 'version_conflict') { cloudVersion = -1; set({ notice: '다른 기기에서 더 최근에 저장되었습니다. 이 기기의 클라우드 저장을 건너뜁니다' }); }
    }
  };
  const scheduleCloud = () => { if (!get().online) return; if (cloudTimer) clearTimeout(cloudTimer); cloudTimer = setTimeout(() => { void pushCloud(); }, 5000); };
  /** 서버 클라우드 저장을 읽어 세션을 돌려주고(아카이브·기억·전적도 병합) 로컬 버전 표시를 갱신한다 */
  const pullCloud = async (wallet: W.Wallet): Promise<Session | null> => {
    try {
      const g = await remote.saveGet();
      const localVer = (await loadKV<number>('cloudVersion')) ?? 0;
      if (!g.data || g.version <= localVer) { if (g.version > localVer) await saveKV('cloudVersion', g.version); return null; }
      const blob = await unpack<{ session: Session | null; kv: { archive?: Record<RecordGroup, HandRecord[]>; memory?: OppModel; tourneys?: TourneyResult[] } }>(g.data);
      if (blob.kv?.archive) set({ archive: blob.kv.archive });
      if (blob.kv?.memory) set({ memory: blob.kv.memory });
      if (blob.kv?.tourneys) set({ tourneys: blob.kv.tourneys });
      await saveAll({ kv: { archive: get().archive, memory: get().memory, tourneys: get().tourneys, cloudVersion: g.version } });
      cloudVersion = g.version;
      const sess = blob.session;
      return sess && (!sess.sid || wallet.accounts[sess.sid]?.status === 'open') ? sess : null;
    } catch { return null; /* 오프라인이면 다음 기회에 */ }
  };
  const save = (session: Session | null | undefined, wallet: W.Wallet = get().wallet, kv?: Record<string, unknown>) => {
    void saveAll({ session, wallet, kv }).catch(() => set({ notice: '저장 실패 (저장소 접근 불가)' }));
    scheduleCloud();
  };
  const commit = (s: Session) => { set({ session: s }); save(s); };

  const archiveRecords = (s: Session | null): Record<RecordGroup, HandRecord[]> => {
    const ar = get().archive;
    if (!s || !s.records.length) return ar;
    const grp = groupOf(s);
    return { ...ar, [grp]: [...ar[grp], ...s.records] };
  };
  const mergeMemory = (s: Session | null): OppModel => (s ? s.memory : get().memory);

  /** 토너먼트 상태 변화(블라인드 상승·탈락·버블·입상…)를 피드에 알림으로 추가 */
  function announce(s: Session): Session {
    const cur = tourneyStatus(s);
    if (!cur) return s;
    const msgs = tourneyAnnouncements(s.tstat ?? null, cur);
    const lines: StoryLine[] = msgs.map((text, i) => ({ id: `t-${s.game.handNo}-${cur.level}-${cur.playersLeft}-${i}`, handNo: s.game.handNo, kind: 'system', speaker: '토너먼트', emoji: '📣', text, ts: Date.now() }));
    return { ...s, tstat: cur, feed: lines.length ? [...(s.feed ?? []), ...lines].slice(-60) : s.feed };
  }

  /** 핸드 종료 직후 해설을 피드에 추가 (핸드당 1회) */
  function direct() {
    const s = get().session;
    if (!s || !s.records.length) return;
    const rec = s.records[s.records.length - 1];
    if ((s.directedHand ?? 0) >= rec.handNo) return;
    const heroSeat = rec.startStacks.find((x) => x.id === 'hero')!.seat;
    let lines: StoryLine[] = [];
    try { lines = directHand({ rec, heroSeat, history: s.records.slice(0, -1), memory: s.memory, characters: false }); } catch { /* 해설 실패는 게임을 막지 않는다 */ }
    commit(announce({ ...s, feed: [...(s.feed ?? []), ...lines].slice(-60), directedHand: rec.handNo }));
  }

  async function runAI(myGen: number) {
    set({ busy: true });
    while (gen === myGen) {
      const s = get().session;
      if (!s || !isAITurn(s)) break;
      const seatNow = s.game.toAct as number;
      const prof = s.aiById?.[s.game.players[seatNow].id]?.profileId ?? s.aiBySeat[seatNow]?.profileId;
      const think = ({ Wild: 0.6, Maniac: 0.6, LAG: 0.8, CallingStation: 0.9, Rock: 1.4, Nit: 1.5, TAG: 1.1, Trapper: 1.3, AdaptivePro: 1.3 } as Record<string, number>)[prof ?? ''] ?? 1;
      const ms = get().skip ? 0 : Math.round(get().settings.animMs * think * (0.7 + ((s.game.events.length * 37 + seatNow * 11) % 7) / 10));
      if (ms > 0) await delay(ms);
      if (gen !== myGen) return;
      const cur = get().session!;
      if (!isAITurn(cur)) break;
      const { sess } = aiStep(cur);
      if (get().settings.sound) {
        const last = sess.game.events[sess.game.events.length - 1];
        if (last) (last.type === 'fold' ? sfx.fold : last.type === 'check' ? sfx.check : sfx.chip)();
      }
      commit(sess);
    }
    if (gen === myGen) {
      set({ busy: false, skip: false });
      const s = get().session;
      if (s && handOver(s)) direct();
      if (s && handOver(s) && (sessionOver(s) || tournamentResult(s))) get().finalizeTourney();
      if (s && handOver(s) && get().settings.sound) {
        const hero = s.game.players.findIndex((p) => p.isHuman);
        (s.game.result?.net[hero] ?? 0) > 0 ? sfx.win() : sfx.lose();
      }
    }
  }

  const begin = (s: Session) => { gen++; set({ session: s, screen: 'table', notice: null, hasSave: true }); void runAI(gen); };

  return {
    wallet: W.newWallet(),
    walletErrors: null,
    memory: {},
    archive: { competitive: [], training: [] },
    tourneys: [],
    settings: DEFAULT_SETTINGS,
    online: false, localRanked: [], settlement: null, settling: 'idle', settleError: null,
    session: null, saved: null, screen: 'menu', busy: false, skip: false, notice: null, corrupt: null, ready: false, hasSave: false,

    recordsFor(g) { const s = get().session; return [...get().archive[g], ...(s && groupOf(s) === g ? s.records : [])]; },
    skipAI() { set({ skip: true }); },
    clearNotice() { set({ notice: null }); },

    /** 로컬(이 기기) 데이터 로드 + 서버 계정이면 서버 지갑으로 교체. 온라인/로컬 전환은 attachAccount 가 먼저 DB 를 고른다. */
    async init() {
      const st = await loadKV<Settings>('settings');
      if (st) { set({ settings: { ...DEFAULT_SETTINGS, ...st } }); setMuted(!st.sound); }
      const tr = await loadKV<TourneyResult[]>('tourneys');
      if (tr) set({ tourneys: tr });
      const lr = await loadKV<HumanResult[]>('localRanked');
      if (lr) set({ localRanked: lr });
      const ar = await loadKV<Record<RecordGroup, HandRecord[]>>('archive');
      if (ar) set({ archive: { competitive: ar.competitive ?? [], training: ar.training ?? [] } });
      const mem = await loadKV<OppModel>('memory');
      if (mem) set({ memory: mem });

      // 통장: 온라인이면 서버 확정 지갑, 로컬이면 이 기기 통장. 손상이면 오류를 보여주고 조용히 고치지 않는다.
      let wallet = get().wallet;
      let walletBad: string[] | null = null;
      if (get().online) {
        try {
          const rs = await remote.state();
          wallet = rs.wallet; if (rs.walletErrors?.length) walletBad = rs.walletErrors;
        } catch (e) { set({ notice: `서버 연결 실패: ${(e as Error).message}` }); walletBad = ['서버에서 지갑을 불러오지 못했습니다']; }
      } else {
        const wl = await loadWallet();
        if (wl.status === 'corrupt') walletBad = wl.errors; else wallet = wl.status === 'ok' ? wl.wallet : W.newWallet();
      }
      if (walletBad) set({ walletErrors: walletBad });

      const r = await loadSession();
      let saved: Session | null = null;
      if (r.status === 'ok') saved = r.session; else if (r.status === 'corrupt') set({ corrupt: { errors: r.errors } });
      // 다른 기기에서 진행하던 경기: 이 기기에 세션이 없으면 클라우드 저장에서 먼저 복원한다 (복원 전에 포기 처리하면 안 된다)
      if (get().online && !walletBad && r.status === 'none') saved = (await pullCloud(wallet)) ?? saved;
      if (!walletBad) {
        if (get().online) {
          // 서버에 열려 있는데 이 기기에 대응하는 세션이 없는 경기는 포기 처리(서버 확정). 다른 기기의 진행 중 경기는 클라우드 저장으로 이어받는다.
          for (const a of Object.values(wallet.accounts)) {
            if (a.status === 'open' && a.kind !== 'practice' && (!saved || saved.sid !== a.id) && r.status !== 'corrupt') {
              try { wallet = (await remote.abandon(a.id)).wallet; } catch { /* 다음 시작 때 다시 시도 */ }
            }
          }
        } else {
          wallet = r.status === 'corrupt' ? wallet : reconcile(wallet, saved);
        }
        // 종료 직전 앱이 꺼져 정산되지 못한 대회(탈락/우승 확정 + 계정 열림)는 여기서 한 번 정산한다
        if (saved?.sid && tournamentResult(saved) && wallet.accounts[saved.sid]?.status === 'open') {
          set({ wallet, session: saved });
          await get().finalizeTourney();
          wallet = get().wallet; saved = get().session; set({ session: null });
        }
        // 이미 끝난 경기가 남아 있으면 정리(상금은 이미 정산됨)
        if (saved && sessionOver(saved) && (!saved.sid || wallet.accounts[saved.sid]?.status !== 'open')) {
          const ar2 = { ...get().archive }; if (saved.records.length) { const g = groupOf(saved); ar2[g] = [...ar2[g], ...saved.records]; }
          set({ archive: ar2 }); saved = null;
          await saveAll({ session: null, wallet, kv: { archive: ar2, memory: mem ?? {} } });
        } else await saveAll({ wallet });
        set({ wallet });
      }
      set({ saved, hasSave: !!saved && !sessionOver(saved), ready: true });
    },

    /** 계정 전환: 해당 계정 전용 로컬 DB 로 바꾸고(온라인) 처음이면 이 기기의 기존 기록을 복사해 온다 */
    async attachAccount(userId) {
      gen++;
      set({ ready: false, screen: 'menu', online: !!userId, session: null, saved: null, hasSave: false, wallet: W.newWallet(), walletErrors: null, memory: {}, archive: { competitive: [], training: [] }, tourneys: [], localRanked: [], settlement: null, settling: 'idle', settleError: null, corrupt: null, notice: null });
      useDbFor(userId);
      if (userId) { try { await importLegacyInto(userId); } catch { /* 이관 실패는 게임을 막지 않는다 (원본은 그대로) */ } }
      await get().init();
      if (userId) void get().syncCloud();
    },

    async claimDaily() {
      if (!get().online) return '로그인한 계정에서만 받을 수 있습니다';
      try {
        const r = await remote.daily();
        set({ wallet: r.wallet });
        return r.granted > 0 ? `+${r.granted.toLocaleString()} 크레딧을 받았습니다` : (r.reason ?? '지급되지 않았습니다');
      } catch (e) { return (e as Error).message; }
    },

    async syncCloud() { /* 클라우드 복원은 init 에서 세션 정리보다 먼저 수행된다 */ },

    async startCash(tableId, buyIn, level) {
      if (get().walletErrors) { set({ notice: '통장 데이터가 손상되어 경기를 시작할 수 없습니다' }); return; }
      try {
        const table = cashTableById(tableId);
        const sid = newSid();
        let wallet = get().wallet;
        if (get().online && tableId !== 'practice') wallet = (await remote.cashOpen(sid, tableId, buyIn)).wallet;
        const l = launchCash(wallet, table, buyIn, level, get().memory, randomSeed(), sid);
        const s = { ...l.session, tstat: undefined };
        const ar = archiveRecords(get().session);
        set({ wallet: l.wallet, archive: ar, saved: null, settlement: null });
        save(s, l.wallet, { archive: ar });
        begin(s);
      } catch (e) { set({ notice: (e as Error).message }); }
    },

    async startTournament(defId, level, opts) {
      if (get().walletErrors) { set({ notice: '통장 데이터가 손상되어 경기를 시작할 수 없습니다' }); return; }
      try {
        const def = tournamentById(defId);
        const sid = newSid();
        let wallet = get().wallet;
        let seed = randomSeed();
        let instanceId: string | undefined;
        let useTicket = false;
        if (get().online) {
          const source = def.world ? 'world' : 'catalog';
          const r = await remote.entry(sid, source, def.world ? def.world.eventId : def.id, !!opts?.ticket);
          wallet = r.wallet; seed = r.seed; instanceId = r.instanceId; useTicket = !!opts?.ticket;
        } else if (opts?.ticket && def.world) {
          const u = W.useTicketFor(wallet, def.world.eventId, def.world.season, sid);
          if (!u.ticketId) throw new Error('사용 가능한 티켓이 없습니다');
          wallet = u.wallet; useTicket = true;
        }
        const l = launchTournament(wallet, def, level, get().memory, seed, { sid, blindMode: opts?.blindMode, speed: opts?.speed, ticket: useTicket, humanName: useAccount.getState().user?.displayName });
        let s = l.session; s = { ...s, instanceId, tstat: tourneyStatus(s) ?? undefined };
        const ar = archiveRecords(get().session);
        set({ wallet: l.wallet, archive: ar, saved: null, settlement: null, settling: 'idle', settleError: null });
        save(s, l.wallet, { archive: ar });
        begin(s);
      } catch (e) { set({ notice: (e as Error).message }); }
    },

    startPractice(cfg) {
      const sid = newSid();
      const wallet = W.openPractice(get().wallet, sid, '연습 경기');
      // 연습 캐시/훈련 테이블은 칩이 바닥나도 계속할 수 있도록 리바이 패널을 붙인다 (통장 무관)
      const stack = cfg.buyInChips ?? cfg.startBB * cfg.bb;
      const cashCfg = cfg.mode === 'cash' || cfg.mode === 'trainer' ? { tableId: 'practice', label: '연습 경기', min: stack, max: stack } : undefined;
      let s = newSession({ ...cfg, seed: cfg.seed ?? randomSeed(), buyInChips: stack, ...(cashCfg ? { cash: cashCfg } : {}) });
      s = { ...s, sid, memory: structuredClone(get().memory) };
      s = beginHand(s);
      s = { ...s, tstat: tourneyStatus(s) ?? undefined };
      const ar = archiveRecords(get().session);
      set({ wallet, archive: ar, saved: null });
      save(s, wallet, { archive: ar });
      begin(s);
    },

    /** 테이블에서 일어나거나(캐시/연습), 끝난 대회에서 로비로 돌아간다 */
    async leaveTable() {
      const s = get().session; if (!s) return;
      try {
        let w = get().wallet;
        const cashLike = !!s.config.cash || (isPractice(s) && !s.tierId);
        if (cashLike) {
          const acct = s.sid ? w.accounts[s.sid] : undefined;
          if (get().online && acct?.kind === 'cash' && acct.status === 'open') {
            if (s.game.street !== 'complete') throw new Error('핸드가 끝난 뒤에 나갈 수 있습니다');
            const hero = s.game.players.find((p) => p.isHuman)!;
            w = (await remote.cashClose(s.sid!, hero.stack)).wallet;
          } else w = leaveCash(w, s);
        } else if (!sessionOver(s) && !tournamentResult(s)) { set({ notice: '진행 중인 토너먼트에서는 나갈 수 없습니다. 메뉴로 이동하면 일시정지됩니다.' }); return; }
        const ar = archiveRecords(s);
        const mem = mergeMemory(s);
        gen++;
        set({ wallet: w, archive: ar, memory: mem, session: null, saved: null, hasSave: false, busy: false, screen: 'lobby', notice: null });
        save(null, w, { archive: ar, memory: mem });
      } catch (e) { set({ notice: (e as Error).message }); }
    },

    async doRebuy(amount) {
      const s = get().session; if (!s) return;
      try {
        if (!s.config.cash) throw new Error('캐시게임에서만 가능합니다');
        const acct = s.sid ? get().wallet.accounts[s.sid] : undefined;
        if (get().online && acct?.kind === 'cash') {
          const heroSeat = s.game.players.findIndex((p) => p.isHuman);
          const hero = s.game.players[heroSeat];
          const r = await remote.cashTopup(s.sid!, `h${s.game.handNo}`, amount, hero.stack);
          const already = acct.spent !== r.wallet.accounts[s.sid!].spent ? false : true; // 같은 핸드의 중복 클릭이면 칩을 더하지 않는다
          const ns = already ? s : rebuy(s, heroSeat, amount);
          set({ wallet: r.wallet, session: ns }); save(ns, r.wallet);
          return;
        }
        const r = cashRebuy(get().wallet, s, amount);
        set({ wallet: r.wallet, session: r.session });
        save(r.session, r.wallet);
      } catch (e) { set({ notice: (e as Error).message }); }
    },

    async reenter() {
      const s = get().session; if (!s?.mtt || !s.tierId) return;
      try {
        const def = tournamentById(s.tierId);
        let wallet: W.Wallet;
        if (get().online && s.sid) wallet = (await remote.reenter(s.sid)).wallet;
        else wallet = reenterEconomy(get().wallet, s, def).wallet;
        let n = mttReenter(s); n = beginHand(n);
        set({ wallet, session: n });
        save(n, wallet);
        gen++; void runAI(gen);
      } catch (e) { set({ notice: (e as Error).message }); }
    },
    simToEnd() {
      const s = get().session; if (!s?.mtt || s.mtt.finished) return;
      set({ busy: true });
      void mttSimToEndAsync(s, randomSeed()).then((n) => { commit(n); set({ busy: false }); void get().finalizeTourney(); }).catch((e) => set({ notice: (e as Error).message, busy: false }));
    },
    declineReentry() {
      const s = get().session; if (!s?.mtt) return;
      const ns = { ...s, mtt: { ...s.mtt, heroCanReenter: false } };
      commit(ns); void get().finalizeTourney();
    },
    async finalizeTourney() {
      const s = get().session;
      if (!s) return;
      const r = tournamentResult(s); // 탈락(ITM 포함)·우승 확정 즉시 — 대회 종료를 기다리지 않는다
      if (!r) return;
      const acct = s.sid ? get().wallet.accounts[s.sid] : undefined;
      let wallet = get().wallet;
      let settlement: Settlement | null = get().settlement;
      if (get().online && acct && acct.kind !== 'practice') {
        if (acct.status === 'open') {
          if (get().settling === 'pending') return;
          set({ settling: 'pending', settleError: null });
          try {
            const hands = s.records.length;
            const res = await remote.settle({ sid: s.sid!, place: r.place, totalEntries: r.field, hands, bounty: r.bounty });
            wallet = res.wallet;
            settlement = { sid: s.sid!, place: res.result.place, prize: res.result.prize, bounty: r.bounty, field: res.result.field, ticket: res.ticket ?? null, confirmedBy: 'server', ranked: !!res.ranked, points: res.points, at: Date.now() };
            set({ settling: 'idle' });
          } catch (e) {
            // 지급 완료로 표시하지 않는다: 재시도 가능한 오류 상태
            set({ settling: 'error', settleError: (e as RemoteError).message });
            return;
          }
        } else if (!settlement || settlement.sid !== s.sid) {
          settlement = { sid: s.sid!, place: acct.place ?? r.place, prize: Math.max(0, acct.returned), bounty: r.bounty, field: acct.fieldSize ?? r.field, ticket: r.ticket, confirmedBy: 'server', ranked: false, at: Date.now() };
        }
      } else if (acct && acct.kind !== 'practice') {
        const wasOpen = acct.status === 'open';
        wallet = settleTournament(wallet, s);
        if (wasOpen) {
          const ev = s.tierId?.startsWith('world:') ? templateById(s.tierId.slice(6)) : null;
          const ranked = !!ev && isRankedEvent(ev);
          settlement = { sid: s.sid!, place: r.place, prize: r.prize, bounty: r.bounty, field: r.field, ticket: r.ticket, confirmedBy: 'local', ranked, at: Date.now() };
          if (ranked && ev) {
            const ps = prizeStructure(ev, r.field);
            const hr: HumanResult = { humanId: 'local', instanceId: s.sid!, season: 2035, eventId: ev.id, day: worldDay(), place: r.place, entries: acct.entries, field: r.field, paid: ev.kind === 'hu' ? 8 : ps.paid, prize: r.prize + r.bounty, cost: acct.spent, rulesVersion: RULES_VERSION };
            const lr = [...get().localRanked, hr];
            set({ localRanked: lr }); void saveKV('localRanked', lr);
          }
        }
      }
      let tourneys = get().tourneys;
      let ns = s;
      if (!s.tourneyRecorded) {
        const a2 = s.sid ? wallet.accounts[s.sid] : undefined;
        // 연습 경기(통장 무관)는 토너먼트 전적/ROI 에 넣지 않는다
        if (a2 && a2.kind !== 'practice') {
          const buyIn = s.mtt ? s.mtt.config.buyIn : s.prize?.buyIn ?? 0;
          tourneys = [...tourneys, { tierId: s.tierId, date: Date.now(), mode: s.config.mode, entrants: r.field, place: r.place, prize: r.prize + r.bounty, buyIn, entries: a2.entries }];
        }
        ns = { ...s, tourneyRecorded: true };
      }
      const mem = mergeMemory(ns);
      set({ wallet, tourneys, session: ns, memory: mem, settlement });
      save(ns, wallet, { tourneys, memory: mem });
    },

    async resume() {
      const s = get().saved ?? (await loadSession().then((r) => (r.status === 'ok' ? r.session : null)));
      if (!s) return;
      set({ saved: null });
      begin(s);
    },

    act(a, token) {
      const s = get().session;
      if (!s || get().busy) return;
      if (token !== decisionToken(s)) return; // 오래된/중복 클릭 무시
      try {
        const next = humanAct(s, a);
        if (get().settings.sound) (a.type === 'fold' ? sfx.fold : a.type === 'check' ? sfx.check : sfx.chip)();
        commit(next);
        gen++;
        void runAI(gen);
      } catch (e) {
        set({ notice: (e as Error).message });
      }
    },
    nextHand() {
      const s = get().session;
      if (!s || !handOver(s) || get().busy) return;
      if (sessionOver(s)) return;
      const myGen = ++gen;
      set({ busy: true });
      void (async () => {
        if (gen !== myGen) return;
        let n = s;
        try {
          const seed = randomSeed();
          if (s.mtt) {
            n = await mttAdvanceAsync(s, seed);
            if (gen !== myGen) return;
            if (sessionOver(n) || n.mtt!.heroOut) { commit(n); set({ busy: false }); get().finalizeTourney(); return; }
          }
          n = beginHand(n, createRng(seed ^ 0x5bd1e995));
          n = announce(n);
        } catch (e) { set({ notice: (e as Error).message, busy: false }); return; }
        commit(n);
        gen++;
        if (get().settings.sound) sfx.card();
        void runAI(gen);
      })();
    },

    setScreen(screen) { set({ screen }); },
    setSettings(p) {
      const settings = { ...get().settings, ...p };
      set({ settings }); setMuted(!settings.sound); void saveKV('settings', settings);
    },
    async quit() { gen++; set({ screen: 'menu', busy: false, hasSave: !!get().session && !sessionOver(get().session!) }); },
    replaceSession(s) { gen++; set({ session: s, screen: 'table' }); save(s); void runAI(gen); },

    /** 손상된 저장 세션을 버린다. 그 세션에 묶여 있던 바이인/참가비는 환불한다(데이터 손상은 플레이어 책임이 아니므로). */
    async dismissCorrupt() {
      let w = get().wallet;
      if (get().online) {
        // 서버 계정: 환불 대신 포기(몰수)로 확정. 클라우드 저장이 있으면 syncCloud 로 복원을 먼저 시도하세요.
        for (const a of Object.values(w.accounts)) if (a.status === 'open' && a.kind !== 'practice') { try { w = (await remote.abandon(a.id)).wallet; } catch { /* 재시도 */ } }
      } else if (!get().walletErrors) for (const a of Object.values(w.accounts)) if (a.status === 'open') w = W.refundOpen(w, a.id);
      set({ corrupt: null, hasSave: false, saved: null, wallet: w });
      await clearSession();
      if (!get().walletErrors) await saveAll({ session: null, wallet: w });
    },
    async resetWallet() {
      const w = W.newWallet();
      set({ wallet: w, walletErrors: null });
      await saveAll({ wallet: w });
    },
  };
});
void clearSession;
