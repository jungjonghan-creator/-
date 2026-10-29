import { test, expect } from '@playwright/test';
import { wipe } from './helpers';

test('고급 분석실: 프리플랍 격자·포스트플랍·ICM·훈련·감사 탭이 작동한다', async ({ page }) => {
  await wipe(page);
  await page.getByTestId('nav-coach').click();
  await expect(page.getByTestId('lab')).toBeVisible();
  // 프리플랍 13×13
  await page.getByTestId('lab-tab-preflop').click();
  await expect(page.getByTestId('pf-grid').locator('[role=gridcell]')).toHaveCount(169);
  await expect(page.getByTestId('rigor-heuristic').first()).toBeVisible();
  const utgTotal = await page.getByTestId('pf-total').innerText();
  await page.getByTestId('pf-pos-select').selectOption('BTN');
  const btnTotal = await page.getByTestId('pf-total').innerText();
  expect(Number(btnTotal.match(/(\d+)%/)![1])).toBeGreaterThan(Number(utgTotal.match(/(\d+)%/)![1]) - 1);
  await page.getByTestId('pf-scenario').selectOption('pushfold');
  await page.getByTestId('pf-stack').selectOption('10');
  await expect(page.getByTestId('pf-grid').locator('[data-action=jam]').first()).toBeVisible();
  // 포스트플랍
  await page.getByTestId('lab-tab-postflop').click();
  await page.getByTestId('board-input').fill('9h Th Jh');
  await expect(page.getByTestId('texture')).toContainText('웻');
  await page.getByTestId('board-input').fill('Ks 7d 2c');
  await expect(page.getByTestId('texture')).toContainText('드라이');
  await page.getByTestId('board-input').fill('Ks Ks 2c');
  await expect(page.getByTestId('board-error')).toBeVisible();
  // ICM
  await page.getByTestId('lab-tab-icm').click();
  await expect(page.getByTestId('rigor-exact').first()).toBeVisible();
  await expect(page.getByTestId('icm-table')).toBeVisible();
  await expect(page.getByTestId('icm-bubble')).toContainText('손익분기 승률');
  await page.getByTestId('icm-stacks').fill('900,800,700,600,500,400,300,200,100,50,40');
  await expect(page.getByTestId('rigor-sampled').first()).toBeVisible();
  await expect(page.getByTestId('icm-note')).toContainText('몬테카를로');
  // 맞춤 훈련: 사전 테스트 1문항 풀이 + 피드백
  await page.getByTestId('lab-tab-train').click();
  await page.getByTestId('train-start').click();
  await expect(page.getByTestId('train-question')).toBeVisible();
  await page.getByTestId('train-call').click();
  await expect(page.getByTestId('train-feedback')).toContainText('필요 승률');
  // 약점 지도: 표본이 없으면 단정하지 않는다
  await page.getByTestId('lab-tab-weak').click();
  await expect(page.getByTestId('weak-empty')).toContainText('표본이 부족');
  // 경제 감사
  await page.getByTestId('lab-tab-audit').click();
  await expect(page.getByTestId('audit-ledger')).toContainText('검산 통과');
  await expect(page.getByTestId('audit-stats')).toBeVisible();
});

test('모바일에서 분석실 격자가 화면 폭을 넘지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await wipe(page);
  await page.getByTestId('nav-coach').click();
  await page.getByTestId('lab-tab-preflop').click();
  const box = await page.getByTestId('pf-grid').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(361);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(over).toBe(false);
});
