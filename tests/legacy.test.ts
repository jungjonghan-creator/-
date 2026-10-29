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

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { exportBackup, importLegacyInto, resetDbForTests, useDbFor, loadKV, saveKV } from '../src/persist/db';
import * as W from '../src/economy/wallet';

describe('기존 기기 기록 이관 (무손실 복사)', () => {
  it('archive/memory/tourneys/settings 만 복사, 지갑은 가져오지 않음, 원본 보존, 중복 이관 방지', async () => {
    (globalThis as any).indexedDB = new IDBFactory(); resetDbForTests();
    useDbFor(null);
    await saveKV('archive', { competitive: [{ handNo: 1 }, { handNo: 2 }], training: [] });
    await saveKV('tourneys', [{ place: 2, prize: 100 }]);
    await saveKV('memory', { 'r-nova': { hands: 50 } });
    await saveKV('settings', { sound: false });
    const w = W.newWallet(); await saveKV('wallet', { ...w, balance: 12345 });
    const rep = await importLegacyInto('acct-1');
    expect(rep.found).toBe(true); expect(rep.copied.archive).toBe(2); expect(rep.legacyWalletBalance).toBe(12345);
    useDbFor('acct-1');
    expect((await loadKV<{ competitive: unknown[] }>('archive'))!.competitive.length).toBe(2);
    expect(await loadKV('wallet')).toBeUndefined();                       // 지갑은 서버 원장에서 시작
    expect((await loadKV<{ found: boolean }>('legacy_import'))!.found).toBe(true);
    expect((await importLegacyInto('acct-1')).note).toContain('이미 이관됨'); // 멱등
    useDbFor(null);                                                       // 원본 그대로
    expect((await loadKV<unknown[]>('tourneys'))!.length).toBe(1);
    expect(((await loadKV('wallet')) as { balance: number }).balance).toBe(12345);
    void openDB;
  });
  it('백업 내보내기: JSON 과 SHA-256 체크섬', async () => {
    (globalThis as any).indexedDB = new IDBFactory(); resetDbForTests(); useDbFor(null);
    await saveKV('tourneys', [{ place: 1 }]);
    const b = await exportBackup();
    expect(b.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(b.text).data.tourneys.length).toBe(1);
  });
});
