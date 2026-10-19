import { create } from 'zustand';
import { Action, AllInAction, HandRecord } from '../engine/types';
import { randomSeed, createRng } from '../engine/rng';
import { newMTTSession, mttReenter, MTTConfig } from '../game/mtt';
import { mttAdvanceAsync, mttSimToEndAsync } from '../game/workerClient';
import { sngPayouts } from '../game/icm';
import { Difficulty } from '../ai/profiles';
import { tierById } from '../game/tiers';
import { aiStep, beginHand, defaultAIs, humanAct, isAITurn, newSession, rebuy, Session, SessionConfig, sessionOver, handOver } from '../game/session';
import { clearSession, loadKV, loadSession, saveKV, saveSession } from '../persist/db';
import { sfx, setMuted } from '../sound';
import { tourneyAnnouncements, tourneyStatus } from '../game/tourney';
import { CHAPTERS } from '../story/chapters';
import { CHARACTERS, rivalDifficulty } from '../story/characters';
import { directHand, sessionHighlights, StoryLine } from '../story/director';
import { leave, needsLoan, newStory, sit, StoryState, takeLoan, topUp, chapterOf } from '../story/state';


export type Screen = 'menu' | 'table' | 'stats' | 'history' | 'trainer' | 'coach' | 'story' | 'lobby';
export interface Settings { sound: boolean; animMs: number; revealAI: boolean; hints: boolean; autoCoach: boolean }
const DEFAULT_SETTINGS: Settings = { sound: true, animMs: 450, revealAI: false, hints: false, autoCoach: true };

export interface TourneyResult { tierId?: string; date: number; mode: string; entrants: number; place: number; prize: number; buyIn: number; entries: number }
export type RecordGroup = 'competitive' | 'training';
export const groupOf = (s: Session): RecordGroup => (s.config.mode === 'trainer' ? 'training' : 'competitive');

interface Store {
  archive: Record<RecordGroup, HandRecord[]>;
  recordsFor(g: RecordGroup): HandRecord[];
  session: Session | null;
  screen: Screen;
  busy: boolean;
  skip: boolean;
  skipAI(): void;
  settings: Settings;
  notice: string | null;
  corrupt: { errors: string[] } | null;
  hasSave: boolean;
  init(): Promise<void>;
  start(cfg: Omit<SessionConfig, 'seed'> & { seed?: number }): void;
  startTier(tierId: string, humanName?: string, difficulty?: Difficulty): void;
  startMTT(cfg: { mtt: MTTConfig; startBB: number; bb: number; speed: SessionConfig['speed']; humanName: string; difficulty: Difficulty; profileId: string }): void;
  reenter(): void;
  declineReentry(): void;
  simToEnd(): void;
  tourneys: TourneyResult[];
  finalizeTourney(): void;
  resume(): Promise<void>;
  act(a: Action | AllInAction, token: string): void;
  nextHand(): void;
  doRebuy(amount: number): void;
  story: StoryState;
  startStory(chapterId: number, buyInBBs: number): void;
  leaveStory(): void;
  takeStoryLoan(): void;
  loanRebuy(): void;
  dismissChapterClear(): void;
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
  const archiveOld = () => {
    const old = get().session;
    if (old && old.records.length) {
      const grp = groupOf(old);
      const archive = { ...get().archive, [grp]: [...get().archive[grp], ...old.records] };
      set({ archive }); void saveKV('archive', archive);
    }
  };
  const persist = (s: Session) => { void saveSession(s).catch(() => set({ notice: '저장 실패 (저장소 접근 불가)' })); };
  const commit = (s: Session) => { set({ session: s }); persist(s); };

  /** 토너먼트 상태 변화(블라인드 상승·탈락·버블·입상…)를 피드에 알림으로 추가 */
  function announce(s: Session): Session {
    const cur = tourneyStatus(s);
    if (!cur) return s;
    const msgs = tourneyAnnouncements(s.tstat ?? null, cur);
    const lines: StoryLine[] = msgs.map((text, i) => ({ id: `t-${s.game.handNo}-${cur.level}-${cur.playersLeft}-${i}`, handNo: s.game.handNo, kind: 'system', speaker: '토너먼트', emoji: '📣', text, ts: Date.now() }));
    return { ...s, tstat: cur, feed: lines.length ? [...(s.feed ?? []), ...lines].slice(-60) : s.feed };
  }

  /** 핸드 종료 직후 해설/대사를 피드에 추가 (핸드당 1회) */
  function direct() {
    const s = get().session;
    if (!s || !s.records.length) return;
    const rec = s.records[s.records.length - 1];
    if ((s.directedHand ?? 0) >= rec.handNo) return;
    const heroSeat = rec.startStacks.find((x) => x.id === 'hero')!.seat;
    let lines: StoryLine[] = [];
    try { lines = directHand({ rec, heroSeat, history: s.records.slice(0, -1), memory: s.memory, characters: !!s.config.story }); } catch { /* 연출 실패는 게임을 막지 않는다 */ }
    commit(announce({ ...s, feed: [...(s.feed ?? []), ...lines].slice(-60), directedHand: rec.handNo }));
  }

  async function runAI(myGen: number) {
    set({ busy: true });
    while (gen === myGen) {
      const s = get().session;
      if (!s || !isAITurn(s)) break;
      const seatNow = s.game.toAct as number;
      const prof = s.aiById?.[s.game.players[seatNow].id]?.profileId ?? s.aiBySeat[seatNow]?.profileId;
      const think = ({ Maniac: 0.6, CallingStation: 0.9, Nit: 1.5, TAG: 1.1, AdaptivePro: 1.3 } as Record<string, number>)[prof ?? ''] ?? 1;
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

  return {
    tourneys: [],
    archive: { competitive: [], training: [] },
    recordsFor(g) { const s = get().session; return [...get().archive[g], ...(s && groupOf(s) === g ? s.records : [])]; },
    story: newStory(),
    skip: false,
    skipAI() { set({ skip: true }); },
    session: null, screen: 'menu', busy: false, settings: DEFAULT_SETTINGS, notice: null, corrupt: null, hasSave: false,
    async init() {
      const st = await loadKV<Settings>('settings');
      if (st) { set({ settings: { ...DEFAULT_SETTINGS, ...st } }); setMuted(!st.sound); }
      const sty = await loadKV<StoryState>('story');
      if (sty && sty.version === 1) set({ story: sty });
      const tr = await loadKV<TourneyResult[]>('tourneys');
      if (tr) set({ tourneys: tr });
      const ar = await loadKV<Record<RecordGroup, HandRecord[]>>('archive');
      if (ar) set({ archive: { competitive: ar.competitive ?? [], training: ar.training ?? [] } });
      const r = await loadSession();
      if (r.status === 'ok') set({ hasSave: true });
      else if (r.status === 'corrupt') set({ corrupt: { errors: r.errors } });
    },
    start(cfg) {
      gen++;
      archiveOld();
      let s = newSession({ ...cfg, seed: cfg.seed ?? randomSeed() });
      s = beginHand(s);
      s = { ...s, tstat: tourneyStatus(s) ?? undefined };
      set({ session: s, screen: 'table', notice: null });
      persist(s);
      void runAI(gen);
    },
    startTier(tierId, humanName = 'TETO', difficulty = 3) {
      const tr = tierById(tierId);
      set({ currentTier: tr.id } as any);
      if (tr.kind === 'mtt') {
        get().startMTT({ mtt: { entrants: tr.entrants, tableSize: tr.tableSize as 6 | 9, buyIn: tr.buyIn, reentry: !!tr.reentry, reentryUntilLevel: tr.lateRegUntilLevel ?? 4, maxReentries: 2, lateRegUntilLevel: tr.lateRegUntilLevel, lateRegPerRound: tr.lateRegPerRound, aiReentry: tr.aiReentry }, startBB: tr.startBB, bb: tr.bb, speed: tr.speed, humanName, difficulty, profileId: 'Balanced' });
      } else {
        get().start({ mode: tr.kind === 'hu' ? 'headsup-sng' : 'sng', seats: tr.tableSize, startBB: tr.startBB, bb: tr.bb, speed: tr.speed, humanName, ais: defaultAIs(tr.tableSize - 1, difficulty, 'Balanced') });
      }
      const s = get().session; if (s) { const n = { ...s, tierId: tr.id }; set({ session: n }); persist(n); }
    },
    startMTT(cfg) {
      gen++;
      archiveOld();
      let s = newMTTSession({ ...cfg, seed: randomSeed() });
      s = beginHand(s);
      s = { ...s, tstat: tourneyStatus(s) ?? undefined };
      set({ session: s, screen: 'table', notice: null });
      persist(s);
      void runAI(gen);
    },
    reenter() {
      const s = get().session; if (!s?.mtt) return;
      try { let n = mttReenter(s); n = beginHand(n); commit(n); gen++; void runAI(gen); } catch (e) { set({ notice: (e as Error).message }); }
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
      if (!s || s.tourneyRecorded || !sessionOver(s)) return;
      const g = s.game;
      let place: number, entrants: number, prize: number, entries = 1, buyIn = 100;
      if (s.mtt) { place = s.mtt.places['hero'] ?? 1; entrants = s.mtt.totalEntries; prize = s.mtt.heroPrize; entries = s.mtt.entries; buyIn = s.mtt.config.buyIn; }
      else { entrants = g.players.length; place = g.players.find((p) => p.isHuman)?.finishPlace ?? 1; prize = sngPayouts(entrants, buyIn)[place - 1] ?? 0; }
      const tourneys = [...get().tourneys, { tierId: s.tierId, date: Date.now(), mode: s.config.mode, entrants, place, prize, buyIn, entries }];
      const ns = { ...s, tourneyRecorded: true };
      set({ tourneys, session: ns }); void saveKV('tourneys', tourneys); persist(ns);
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
      const myGen = ++gen;
      set({ busy: true });
      // MTT 는 다른 테이블 시뮬레이션이 무거우므로 렌더 후 실행
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
    doRebuy(amount) {
      const s = get().session; if (!s) return;
      try {
        if (s.config.story) {
          const st = topUp(get().story, amount);
          set({ story: st }); void saveKV('story', st);
        }
        commit(rebuy(s, s.game.players.findIndex((p) => p.isHuman), amount));
      } catch (e) { set({ notice: (e as Error).message }); }
    },
    startStory(chapterId, bbs) {
      const ch = chapterOf(chapterId);
      gen++;
      try {
        const st = sit(get().story, ch, bbs);
        archiveOld();
        const rivals = ch.rivals.map((r) => ({ c: CHARACTERS[r.id], d: rivalDifficulty(r.id, r.difficulty) }));
        let s = newSession({
          mode: 'cash', seats: ch.seats, startBB: bbs, bb: ch.bb, speed: 'normal', humanName: 'TETO', seed: randomSeed(),
          ais: rivals.map((r) => ({ profileId: r.c.profileId, difficulty: r.d })), aiNames: rivals.map((r) => r.c.name),
          story: { chapter: ch.id, buyIn: bbs * ch.bb },
        });
        const intro: StoryLine = { id: 'intro', handNo: 0, kind: 'narr', speaker: '해설', emoji: '🎙️', text: ch.intro[0], ts: Date.now() };
        s = { ...s, feed: [intro] };
        s = beginHand(s);
        set({ story: st, session: s, screen: 'table', notice: null }); void saveKV('story', st); persist(s);
        void runAI(gen);
      } catch (e) { set({ notice: (e as Error).message }); }
    },
    leaveStory() {
      const s = get().session; if (!s?.config.story) return;
      gen++;
      const hero = s.game.players.find((p) => p.isHuman)!;
      // 진행 중인 핸드의 내 투입분은 포기한 것으로 처리 (핸드 종료 시에만 버튼 노출)
      const hl = sessionHighlights(s.records);
      const st = leave(get().story, hero.stack, s.records.length, hl.headline, hl.best, hl.worst);
      archiveOld();
      set({ story: st, session: null, screen: 'story', busy: false, hasSave: false });
      void saveKV('story', st); void clearSession();
    },
    takeStoryLoan() {
      const st = takeLoan(get().story, chapterOf(get().story.chapter));
      set({ story: st }); void saveKV('story', st);
    },
    loanRebuy() {
      const s = get().session; if (!s?.config.story) return;
      const ch = chapterOf(s.config.story.chapter);
      let st = takeLoan(get().story, ch);
      const amount = s.config.startBB * s.config.bb;
      try { st = topUp(st, amount); } catch (e) { set({ notice: (e as Error).message }); return; }
      set({ story: st }); void saveKV('story', st);
      commit(rebuy(s, s.game.players.findIndex((p) => p.isHuman), amount));
    },
    dismissChapterClear() { const st = { ...get().story, chapterJustCleared: null }; set({ story: st }); void saveKV('story', st); },
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
