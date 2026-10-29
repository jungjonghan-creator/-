import { test, expect } from '@playwright/test';
import { wipe, sitCash, waitTurnOrEnd, playPassively, enterLocal } from './helpers';

for (const [id, seats] of [['c5', 9], ['c6', 8], ['c7', 4], ['c8', 3]] as const) {
  test(`캐시 ${seats}인 테이블(${id}): 착석 → 한 핸드 → 퇴장 정산`, async ({ page }) => {
    await wipe(page);
    await sitCash(page, id);
    await expect(page.locator('[data-testid^=seat-]')).toHaveCount(seats);
    await waitTurnOrEnd(page);
    await playPassively(page);
    await expect(page.getByTestId('hand-end')).toBeVisible();
    await page.getByTestId('btn-leave').click();
    await expect(page.getByTestId('lobby')).toBeVisible();
  });
}

test('설정: 현실/빠른 진행, 큰 글씨, 애니메이션 줄이기가 적용된다', async ({ page }) => {
  await wipe(page);
  await page.getByTestId('nav-account').click();
  await page.getByTestId('speed-fast').click();
  await page.getByTestId('set-bigtext').check();
  await page.getByTestId('set-reducemotion').check();
  expect(await page.evaluate(() => document.documentElement.className)).toContain('big-text');
  expect(await page.evaluate(() => document.documentElement.className)).toContain('reduce-motion');
  await page.reload();
  await enterLocal(page);
  expect(await page.evaluate(() => document.documentElement.className)).toContain('big-text');
});
