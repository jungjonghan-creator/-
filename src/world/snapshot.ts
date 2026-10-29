import type { WorldSnapshot } from './season';
let cache: Promise<WorldSnapshot> | null = null;
/** 공식 AI 세계 스냅샷(시즌 2033~2035, 약 0.8MB)을 필요할 때만 불러온다 */
export const loadSnapshot = (): Promise<WorldSnapshot> => (cache ??= import('./data/season.json').then((m) => m.default as unknown as WorldSnapshot));
