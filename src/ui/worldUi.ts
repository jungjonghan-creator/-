import { create } from 'zustand';
export type Preset = 'all' | 'kr';
interface WorldUi { preset: Preset; openId: string | null; setPreset(p: Preset): void; open(id: string | null): void }
export const useWorldUi = create<WorldUi>((set) => ({ preset: 'all', openId: null, setPreset: (preset) => set({ preset }), open: (openId) => set({ openId }) }));
