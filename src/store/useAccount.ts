import { create } from 'zustand';
import { api } from '../net/api';

export interface User { id: string; username: string; displayName: string; nationality: string; publicProfile?: boolean; entityKey?: string }
/** online = 서버 계정으로 로그인됨(지갑·정산·랭킹은 서버 확정), local = 서버 없이 이 기기에서만(랭킹은 이 기기 기록 + 공식 AI 스냅샷) */
export type Mode = 'unknown' | 'online' | 'local' | 'needLogin';

interface AccountStore {
  mode: Mode;
  user: User | null;
  error: string | null;
  busy: boolean;
  serverReachable: boolean;
  check(): Promise<Mode>;
  register(username: string, password: string, displayName: string, nationality: string, publicProfile: boolean): Promise<boolean>;
  login(username: string, password: string): Promise<boolean>;
  logout(): Promise<void>;
  useLocal(): void;
}

const PREF = 'pa_mode';
const pref = (): string | null => { try { return localStorage.getItem(PREF); } catch { return null; } };
const setPref = (v: string | null) => { try { if (v) localStorage.setItem(PREF, v); else localStorage.removeItem(PREF); } catch { /* 저장 불가 환경 */ } };

export const useAccount = create<AccountStore>((set, get) => ({
  mode: 'unknown', user: null, error: null, busy: false, serverReachable: false,
  async check() {
    const r = await api('GET', '/api/me');
    if (r.ok) { set({ mode: 'online', user: r.data as User, serverReachable: true, error: null }); return 'online'; }
    if (r.status === 401) { const m: Mode = pref() === 'local' ? 'local' : 'needLogin'; set({ mode: m, user: null, serverReachable: true }); return m; }
    set({ mode: 'local', user: null, serverReachable: false }); return 'local';
  },
  async register(username, password, displayName, nationality, publicProfile) {
    set({ busy: true, error: null });
    const r = await api('POST', '/api/register', { username, password, displayName, nationality, publicProfile });
    if (!r.ok) { set({ busy: false, error: (r.data as { error?: string }).error ?? '가입 실패' }); return false; }
    setPref(null); await get().check(); set({ busy: false }); return true;
  },
  async login(username, password) {
    set({ busy: true, error: null });
    const r = await api('POST', '/api/login', { username, password });
    if (!r.ok) { set({ busy: false, error: (r.data as { error?: string }).error ?? '로그인 실패' }); return false; }
    setPref(null); await get().check(); set({ busy: false }); return true;
  },
  async logout() { await api('POST', '/api/logout', {}); setPref(null); set({ mode: 'needLogin', user: null }); },
  useLocal() { setPref('local'); set({ mode: 'local', user: null }); },
}));
