import { create } from 'zustand';
import { Action, AllInAction, HandRecord } from '../engine/types';
import { randomSeed, createRng } from '../engine/rng';
import { aiStep, beginHand, humanAct, isAITurn, newSession, rebuy, Session, SessionConfig, sessionOver, handOver } from '../game/session';
import { clearSession, loadKV, loadSession, saveKV, saveSession } from '../persist/db';
import { sfx, setMuted } from '../sound';

export type Screen = 'menu' | 'table' | 'stats' | 'history' | 'trainer';
export interface Settings { sound: boolean; animMs: number; revealAI: boolean; hints: boolean }
const DEFAULT_SETTINGS: Settings = { sound: true, animMs: 450, revealAI: false, hints: false };

export type RecordGroup = 'competitive' | 'training';
export const groupOf = (s: Session): RecordGroup => (s.config.mode === 'trainer' ? 'training' : 'competitive');

interface Store {
  archive: Record<RecordGroup, HandRecord[]>;
  recordsFor(g: RecordGroup): HandRecord[];
  session: Session | null;
  screen: Screen;
  busy: boolean;
  settings: Settings;
  notice: string | null;
  corrupt: { errors: string[] } | null;
  hasSave: boolean;
  init(): Promise<void>;
  start(cfg: Omit<SessionConfig, 'seed'> & { seed?: number }): void;
  resume(): Promise<void>;
  act(a: Action | AllInAction, token: string): void;
  nextHand(): void;
  doRebuy(amount: number): void;
  setScreen(s: Screen): void;
  setSettings(p: Partial<Settings>): void;
  quit(): Promise<void>;
  replaceSession(s: Session): void;
  dismissCorrupt(): Promise<void>;
}

let gen = 0;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const decisionToken = (s: Session) => `${s.game.handNo}:${s.game.events.length}`;

export const useGame = create<Store>((set, get) => {
  const persist = (s: Session) => { void saveSession(s).catch(() => set({ notice: '저장 실패 (저장소 접근 불가)' })); };
  const commit = (s: Session) => { set({ session: s }); persist(s); };

  async function runAI(myGen: number) {
    set({ busy: true });
    while (gen === myGen) {
      const s = get().session;
      if (!s || !isAITurn(s)) break;
      const ms = get().settings.animMs;
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
      set({ busy: false });
      const s = get().session;
      if (s && handOver(s) && get().settings.sound) {
        const hero = s.game.players.findIndex((p) => p.isHuman);
        (s.game.result?.net[hero] ?? 0) > 0 ? sfx.win() : sfx.lose();
      }
    }
  }

  return {
    archive: { competitive: [], training: [] },
    recordsFor(g) { const s = get().session; return [...get().archive[g], ...(s && groupOf(s) === g ? s.records : [])]; },
    session: null, screen: 'menu', busy: false, settings: DEFAULT_SETTINGS, notice: null, corrupt: null, hasSave: false,
    async init() {
      const st = await loadKV<Settings>('settings');
      if (st) { set({ settings: { ...DEFAULT_SETTINGS, ...st } }); setMuted(!st.sound); }
      const ar = await loadKV<Record<RecordGroup, HandRecord[]>>('archive');
      if (ar) set({ archive: { competitive: ar.competitive ?? [], training: ar.training ?? [] } });
      const r = await loadSession();
      if (r.status === 'ok') set({ hasSave: true });
      else if (r.status === 'corrupt') set({ corrupt: { errors: r.errors } });
    },
    start(cfg) {
      gen++;
      const old = get().session;
      if (old && old.records.length) {
        const grp = groupOf(old);
        const archive = { ...get().archive, [grp]: [...get().archive[grp], ...old.records] };
        set({ archive }); void saveKV('archive', archive);
      }
      let s = newSession({ ...cfg, seed: cfg.seed ?? randomSeed() });
      s = beginHand(s);
      set({ session: s, screen: 'table', notice: null });
      persist(s);
      void runAI(gen);
    },
    async resume() {
      const r = await loadSession();
      if (r.status !== 'ok') return;
      gen++;
      set({ session: r.session, screen: 'table', notice: null });
      void runAI(gen);
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
      let n = s;
      try { n = beginHand(s, createRng(randomSeed())); } catch (e) { set({ notice: (e as Error).message }); return; }
      commit(n);
      gen++;
      if (get().settings.sound) sfx.card();
      void runAI(gen);
    },
    doRebuy(amount) {
      const s = get().session; if (!s) return;
      try { commit(rebuy(s, s.game.players.findIndex((p) => p.isHuman), amount)); } catch (e) { set({ notice: (e as Error).message }); }
    },
    setScreen(screen) { set({ screen }); },
    setSettings(p) {
      const settings = { ...get().settings, ...p };
      set({ settings }); setMuted(!settings.sound); void saveKV('settings', settings);
    },
    async quit() { gen++; set({ screen: 'menu', busy: false }); const s = get().session; set({ hasSave: !!s }); },
    replaceSession(s) { gen++; set({ session: s, screen: 'table' }); persist(s); void runAI(gen); },
    async dismissCorrupt() { await clearSession(); set({ corrupt: null, hasSave: false }); },
  };
});
