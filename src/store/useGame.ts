import { create } from 'zustand';
import { Action, AllInAction, HandRecord } from '../engine/types';
import { randomSeed, createRng } from '../engine/rng';
import { mttReenter } from '../game/mtt';
import { mttAdvanceAsync, mttSimToEndAsync } from '../game/workerClient';
import { aiStep, beginHand, humanAct, isAITurn, newSession, Session, SessionConfig, sessionOver, handOver } from '../game/session';
import { clearSession, loadKV, loadSession, loadWallet, saveAll, saveKV } from '../persist/db';
import { sfx, setMuted } from '../sound';
import { tourneyAnnouncements, tourneyStatus } from '../game/tourney';
import { directHand, StoryLine } from '../story/director';
import { OppModel } from '../ai/opponentModel';
import * as W from '../economy/wallet';
import { cashRebuy, launchCash, launchTournament, leaveCash, newSid, reconcile, reenterEconomy, settleTournament, tournamentResult } from '../economy/actions';
import { cashTableById, LevelId, tournamentById } from '../economy/catalog';

export type Screen = 'menu' | 'table' | 'stats' | 'history' | 'trainer' | 'coach' | 'lobby' | 'wallet' | 'practice';
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

  startCash(tableId: string, buyIn: number, level: LevelId): void;
  startTournament(defId: string, level: LevelId, opts?: { blindMode?: 'regular' | 'adaptive'; speed?: SessionConfig['speed'] }): void;
  /** 통장과 무관한 연습 경기 (기존 빠른 설정 화면) */
  startPractice(cfg: Omit<SessionConfig, 'seed'> & { seed?: number }): void;
  leaveTable(): void;
  doRebuy(amount: number): void;
  reenter(): void;
  declineReentry(): void;
  simToEnd(): void;
  finalizeTourney(): void;

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
  const save = (session: Session | null | undefined, wallet: W.Wallet = get().wallet, kv?: Record<string, unknown>) => {
    void saveAll({ session, wallet, kv }).catch(() => set({ notice: '저장 실패 (저장소 접근 불가)' }));
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
      if (s && handOver(s) && sessionOver(s)) get().finalizeTourney();
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
    session: null, saved: null, screen: 'menu', busy: false, skip: false, notice: null, corrupt: null, ready: false, hasSave: false,

    recordsFor(g) { const s = get().session; return [...get().archive[g], ...(s && groupOf(s) === g ? s.records : [])]; },
    skipAI() { set({ skip: true }); },
    clearNotice() { set({ notice: null }); },

    async init() {
      const st = await loadKV<Settings>('settings');
      if (st) { set({ settings: { ...DEFAULT_SETTINGS, ...st } }); setMuted(!st.sound); }
      const tr = await loadKV<TourneyResult[]>('tourneys');
      if (tr) set({ tourneys: tr });
      const ar = await loadKV<Record<RecordGroup, HandRecord[]>>('archive');
      if (ar) set({ archive: { competitive: ar.competitive ?? [], training: ar.training ?? [] } });
      const mem = await loadKV<OppModel>('memory');
      if (mem) set({ memory: mem });

      // 통장: 없으면 새로 만든다(첫 실행/기존 사용자 마이그레이션 — 기존 전적·기록은 그대로 유지). 손상이면 오류를 보여주고 조용히 고치지 않는다.
      const wl = await loadWallet();
      let wallet = get().wallet;
      if (wl.status === 'corrupt') set({ walletErrors: wl.errors });
      else wallet = wl.status === 'ok' ? wl.wallet : W.newWallet();

      const r = await loadSession();
      let saved: Session | null = null;
      if (r.status === 'ok') saved = r.session; else if (r.status === 'corrupt') set({ corrupt: { errors: r.errors } });
      if (wl.status !== 'corrupt') {
        // 저장된 세션과 연결되지 않은 열린 계정은 몰수 처리
        const rec = r.status === 'corrupt' ? wallet : reconcile(wallet, saved);
        wallet = rec;
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

    startCash(tableId, buyIn, level) {
      if (get().walletErrors) { set({ notice: '통장 데이터가 손상되어 경기를 시작할 수 없습니다' }); return; }
      try {
        const table = cashTableById(tableId);
        const l = launchCash(get().wallet, table, buyIn, level, get().memory, randomSeed(), newSid());
        const s = { ...l.session, tstat: undefined };
        const ar = archiveRecords(get().session);
        set({ wallet: l.wallet, archive: ar, saved: null });
        save(s, l.wallet, { archive: ar });
        begin(s);
      } catch (e) { set({ notice: (e as Error).message }); }
    },

    startTournament(defId, level, opts) {
      if (get().walletErrors) { set({ notice: '통장 데이터가 손상되어 경기를 시작할 수 없습니다' }); return; }
      try {
        const def = tournamentById(defId);
        const l = launchTournament(get().wallet, def, level, get().memory, randomSeed(), { sid: newSid(), blindMode: opts?.blindMode, speed: opts?.speed });
        let s = l.session; s = { ...s, tstat: tourneyStatus(s) ?? undefined };
        const ar = archiveRecords(get().session);
        set({ wallet: l.wallet, archive: ar, saved: null });
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
    leaveTable() {
      const s = get().session; if (!s) return;
      try {
        let w = get().wallet;
        const cashLike = !!s.config.cash || (isPractice(s) && !s.tierId);
        if (cashLike) w = leaveCash(w, s);
        else if (!sessionOver(s)) { set({ notice: '진행 중인 토너먼트에서는 나갈 수 없습니다. 메뉴로 이동하면 일시정지됩니다.' }); return; }
        const ar = archiveRecords(s);
        const mem = mergeMemory(s);
        gen++;
        set({ wallet: w, archive: ar, memory: mem, session: null, saved: null, hasSave: false, busy: false, screen: 'lobby', notice: null });
        save(null, w, { archive: ar, memory: mem });
      } catch (e) { set({ notice: (e as Error).message }); }
    },

    doRebuy(amount) {
      const s = get().session; if (!s) return;
      try {
        if (!s.config.cash) throw new Error('캐시게임에서만 가능합니다');
        const r = cashRebuy(get().wallet, s, amount);
        set({ wallet: r.wallet, session: r.session });
        save(r.session, r.wallet);
      } catch (e) { set({ notice: (e as Error).message }); }
    },

    reenter() {
      const s = get().session; if (!s?.mtt || !s.tierId) return;
      try {
        const def = tournamentById(s.tierId);
        const r = reenterEconomy(get().wallet, s, def);
        let n = mttReenter(s); n = beginHand(n);
        set({ wallet: r.wallet, session: n });
        save(n, r.wallet);
        gen++; void runAI(gen);
      } catch (e) { set({ notice: (e as Error).message }); }
    },
    simToEnd() {
      const s = get().session; if (!s?.mtt || s.mtt.finished) return;
      set({ busy: true });
      void mttSimToEndAsync(s, randomSeed()).then((n) => { commit(n); set({ busy: false }); }).catch((e) => set({ notice: (e as Error).message, busy: false }));
    },
    declineReentry() {
      const s = get().session; if (!s?.mtt) return;
      const ns = { ...s, mtt: { ...s.mtt, heroCanReenter: false } };
      commit(ns); get().finalizeTourney();
    },
    finalizeTourney() {
      const s = get().session;
      if (!s || !sessionOver(s)) return;
      const r = tournamentResult(s);
      if (!r) return;
      // 상금 정산 (같은 대회는 한 번만 — 통장이 멱등성을 보장)
      const wallet = settleTournament(get().wallet, s);
      let tourneys = get().tourneys;
      let ns = s;
      if (!s.tourneyRecorded) {
        const acct = s.sid ? wallet.accounts[s.sid] : undefined;
        // 연습 경기(통장 무관)는 토너먼트 전적/ROI 에 넣지 않는다
        if (acct && acct.kind !== 'practice') {
          const buyIn = s.mtt ? s.mtt.config.buyIn : s.prize?.buyIn ?? 0;
          tourneys = [...tourneys, { tierId: s.tierId, date: Date.now(), mode: s.config.mode, entrants: r.field, place: r.place, prize: r.prize, buyIn, entries: acct.entries }];
        }
        ns = { ...s, tourneyRecorded: true };
      }
      const mem = mergeMemory(ns);
      set({ wallet, tourneys, session: ns, memory: mem });
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
      if (!get().walletErrors) for (const a of Object.values(w.accounts)) if (a.status === 'open') w = W.refundOpen(w, a.id);
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
