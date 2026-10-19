import { Page, expect } from '@playwright/test';

export async function startGame(page: Page, opts: { seats?: number; stack?: number; mode?: string; speed?: string } = {}) {
  await page.goto('/');
  await page.evaluate(async () => { const r = indexedDB.deleteDatabase('poker-arena'); await new Promise((res) => { r.onsuccess = r.onerror = r.onblocked = () => res(null); }); });
  await page.reload();
  await page.getByTestId(opts.mode ?? 'mode-cash').click();
  if (opts.seats) await page.getByTestId(`seats-${opts.seats}`).click();
  if (opts.stack) await page.getByTestId(`stack-${opts.stack}`).click();
  if (opts.speed) await page.getByTestId(`speed-${opts.speed}`).click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('table')).toBeVisible();
  await page.getByTestId('speed').selectOption('0');
}

export async function waitTurnOrEnd(page: Page) {
  await page.waitForFunction(() => document.querySelector('[data-testid=btn-fold]') || document.querySelector('[data-testid=hand-end]'), null, { timeout: 15000 });
}
export const handOver = (page: Page) => page.getByTestId('hand-end').isVisible();

/** 핸드가 끝날 때까지 체크/콜만 한다 (소액 콜) */
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
export async function heroCards(page: Page): Promise<string[]> {
  return page.locator('[data-testid=seat-0] [data-testid=card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-card')!));
}
export async function boardCards(page: Page): Promise<string[]> {
  return page.locator('[data-testid=board] [data-testid=card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-card')!));
}
