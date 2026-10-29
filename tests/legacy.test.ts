import { describe, expect, it } from 'vitest';
import { legacyProfile } from '../src/analysis/legacy';
import { simulateAll, defaultAIs } from '../src/game/session';

describe('기존 기록 → 프로필 (증거 기반)', () => {
  it('저장된 핸드가 없으면 미확인/표본 부족이며 수치를 만들어 내지 않는다', () => {
    const p = legacyProfile([], 0);
    expect(p.hands).toBe(0); expect(p.note).toContain('미확인'); expect(p.dateRange).toBe('미확인');
    expect(p.metrics.every((m) => m.pct === null || m.den === 0)).toBe(true);
    expect(p.metrics.every((m) => m.confidence === '표본 부족')).toBe(true);
  });
  it('저장된 핸드가 있으면 표본 크기와 함께 지표를 계산한다', () => {
    const s = simulateAll({ mode: 'cash', seats: 4, startBB: 100, bb: 100, speed: 'normal', humanName: 'TETO', seed: 5, ais: defaultAIs(3, 3) }, 150, { profileId: 'Balanced', difficulty: 3 });
    const recs = s.records.map((r) => ({ ...r, startStacks: r.startStacks.map((x, i) => (i === 0 ? { ...x, id: 'hero' } : x)) }));
    const p = legacyProfile(recs as never, 3);
    expect(p.hands).toBeGreaterThan(100);
    const vpip = p.metrics.find((m) => m.key === 'vpip')!;
    expect(vpip.den).toBe(p.hands); expect(vpip.confidence).not.toBe('표본 부족'); expect(vpip.pct).toBeGreaterThan(0);
  });
});
