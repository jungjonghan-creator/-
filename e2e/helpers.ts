import { Page, expect } from '@playwright/test';

export async function wipe(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => { const r = indexedDB.deleteDatabase('poker-arena'); await new Promise((res) => { r.onsuccess = r.onerror = r.onblocked = () => res(null); }); });
  await page.reload();
  await expect(page.getByTestId('home-balance')).toBeVisible();
}

/** 통장 잔액을 지정해 저장소를 초기화한다 (경제 시나리오 테스트용) */
export async function seedWallet(page: Page, balance: number) {
  await wipe(page);
  await page.evaluate(async (bal) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const o = indexedDB.open('poker-arena', 1); o.onupgradeneeded = () => { if (!o.result.objectStoreNames.contains('kv')) o.result.createObjectStore('kv'); }; o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); });
    const w = { version: 1, initial: bal, balance: bal, peak: bal, created: 0, txs: [{ id: 'initial', ts: 0, kind: 'initial', amount: 0, ref: '', note: 'seed', balanceAfter: bal }], accounts: {} };
    await new Promise<void>((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(w, 'wallet'); tx.oncomplete = () => res(); });
    db.close();
  }, balance);
  await page.reload();
  await expect(page.getByTestId('home-balance')).toHaveText(balance.toLocaleString());
}

/** 연습 경기(통장 무관)를 설정해 시작 */
export async function startGame(page: Page, opts: { seats?: number; stack?: number; mode?: string; speed?: string } = {}) {
  await wipe(page);
  await page.getByTestId('nav-practice').click();
  await page.getByTestId(opts.mode ?? 'mode-cash').click();
  if (opts.seats) await page.getByTestId(`seats-${opts.seats}`).click();
  if (opts.stack) await page.getByTestId(`stack-${opts.stack}`).click();
  if (opts.speed) await page.getByTestId(`speed-${opts.speed}`).click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('table')).toBeVisible();
  await page.getByTestId('speed').selectOption('0');
}

export async function sitCash(page: Page, tableId = 'c1', level = 'beginner') {
  await page.getByTestId('nav-lobby').click();
  await page.getByTestId(`cash-open-${tableId}`).click();
  await page.getByTestId(`cash-level-${tableId}-${level}`).click();
  await page.getByTestId(`cash-sit-${tableId}`).click();
  await expect(page.getByTestId('table')).toBeVisible();
  await page.getByTestId('speed').selectOption('0');
}
export async function joinTournament(page: Page, id: string, level = 'beginner') {
  await page.getByTestId('nav-lobby').click();
  await page.getByTestId('tab-tourney').click();
  await page.getByTestId(`tourney-open-${id}`).click();
  await page.getByTestId(`tourney-level-${id}-${level}`).click();
  await page.getByTestId(`tourney-start-${id}`).click();
  await expect(page.getByTestId('table')).toBeVisible();
  await page.getByTestId('speed').selectOption('0');
}

export async function waitTurnOrEnd(page: Page) {
  await page.waitForFunction(() => document.querySelector('[data-testid=btn-fold]') || document.querySelector('[data-testid=hand-end]'), null, { timeout: 15000 });
}
export const handOver = (page: Page) => page.getByTestId('hand-end').isVisible();

/** 핸드가 끝날 때까지 체크/콜만 한다 */
export async function playPassively(page: Page) {
  for (let i = 0; i < 60; i++) {
    await waitTurnOrEnd(page);
    if (await handOver(page)) return;
    const check = page.getByTestId('btn-check');
    if (await check.count()) await check.click();
    else await page.getByTestId('btn-call').click();
    await page.waitForTimeout(30);
  }
  throw new Error('hand did not finish');
}
export async function foldThroughHand(page: Page) {
  for (let i = 0; i < 40; i++) {
    await waitTurnOrEnd(page);
    if (await page.getByTestId('hand-end').isVisible()) return;
    if (await page.getByTestId('btn-fold').isEnabled()) await page.getByTestId('btn-fold').click(); else await page.getByTestId('btn-check').click();
    await page.waitForTimeout(30);
  }
}
export async function heroCards(page: Page): Promise<string[]> {
  return page.locator('[data-testid=seat-0] [data-testid=card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-card')!));
}
export async function boardCards(page: Page): Promise<string[]> {
  return page.locator('[data-testid=board] [data-testid=card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-card')!));
}
export const num = (s: string) => Number(s.replace(/[^\d-]/g, ''));
