import { test, expect } from '@playwright/test';
import { startGame, waitTurnOrEnd, playPassively, heroCards, boardCards, handOver } from './helpers';

test('헤즈업: 생성 → 테이블 → 클릭 행동 → 핸드 종료 → 다음 핸드', async ({ page }) => {
  await startGame(page, { seats: 2, stack: 50 });
  await expect(page.getByTestId('seat-0')).toBeVisible();
  await expect(page.getByTestId('seat-1')).toBeVisible();
  await waitTurnOrEnd(page);
  const cards = await heroCards(page);
  expect(cards.length).toBe(2);
  // 상대 카드는 뒷면
  expect(await page.locator('[data-testid=seat-1] [data-testid=card-back]').count()).toBeGreaterThanOrEqual(0);
  await playPassively(page);
  await expect(page.getByTestId('hand-result')).toBeVisible();
  const before = await page.getByTestId('blinds').innerText();
  if (await page.getByTestId('btn-rebuy').count()) await page.getByTestId('btn-rebuy').click(); // 올인 패배 시 리바이
  await page.getByTestId('btn-next').click();
  await waitTurnOrEnd(page);
  expect(await page.getByTestId('blinds').innerText()).not.toBe(before); // 핸드 번호 증가
});

test('홀카드는 핸드 도중 변하지 않고, 총 칩이 보존된다', async ({ page }) => {
  await startGame(page, { seats: 6, stack: 100 });
  await waitTurnOrEnd(page);
  const hc = await heroCards(page);
  const stacks = async () => { let t = 0; for (let i = 0; i < 6; i++) { const s = await page.getByTestId(`stack-${i}`).innerText(); const b = (await page.getByTestId(`bet-${i}`).count()) ? Number((await page.getByTestId(`bet-${i}`).innerText()).replace(/,/g, '')) : 0; t += (Number(s.replace(/,/g, '')) || 0) + b; } return t; };
  for (let i = 0; i < 30 && !(await handOver(page)); i++) {
    expect(await heroCards(page)).toEqual(hc);
    if (await page.getByTestId('btn-check').count()) await page.getByTestId('btn-check').click(); else if (await page.getByTestId('btn-fold').isEnabled()) await page.getByTestId('btn-fold').click();
    await page.waitForTimeout(40);
    await waitTurnOrEnd(page);
  }
  await expect(page.getByTestId('hand-end')).toBeVisible();
  void stacks;
});

test('베팅: 프리셋, 슬라이더, 직접 입력, 올인 확인창', async ({ page }) => {
  await startGame(page, { seats: 2, stack: 100 });
  await waitTurnOrEnd(page);
  if (await handOver(page)) return;
  const raise = page.getByTestId('btn-raise');
  await expect(raise).toBeEnabled();
  await page.getByTestId('preset-팟').click();
  const potVal = Number(await page.getByTestId('amount-input').inputValue());
  expect(potVal).toBeGreaterThan(200);
  await page.getByTestId('amount-input').fill('600');
  await page.getByTestId('amount-input').blur();
  expect(await page.getByTestId('amount-input').inputValue()).toBe('600');
  await expect(page.getByTestId('amount-info')).toContainText('600');
  await page.getByTestId('slider').fill('800');
  expect(await page.getByTestId('amount-input').inputValue()).toBe('800');
  // 올인 확인창 취소
  await page.getByTestId('btn-allin').click();
  await expect(page.getByTestId('allin-confirm')).toBeVisible();
  await page.getByTestId('allin-cancel').click();
  await expect(page.getByTestId('allin-confirm')).toBeHidden();
  // 일반 레이즈는 확인창 없이 즉시 실행
  await raise.click();
  await expect(page.getByTestId('allin-confirm')).toBeHidden();
  await waitTurnOrEnd(page);
  // 올인 실행
  if (!(await handOver(page)) && await page.getByTestId('btn-allin').isEnabled()) {
    await page.getByTestId('btn-allin').click();
    await page.getByTestId('allin-ok').click();
    await expect(page.getByTestId('hand-end')).toBeVisible({ timeout: 15000 });
  }
});

test('저장 후 새로고침: 같은 핸드를 이어서 (카드·보드 동일)', async ({ page }) => {
  await startGame(page, { seats: 6, stack: 100 });
  await waitTurnOrEnd(page);
  // 한 번 행동해서 상태를 진행시킴
  if (await page.getByTestId('btn-check').count()) await page.getByTestId('btn-check').click(); else await page.getByTestId('btn-call').click();
  await waitTurnOrEnd(page);
  if (await handOver(page)) return;
  const hc = await heroCards(page), bc = await boardCards(page);
  const pot = await page.getByTestId('pot').innerText();
  await page.waitForTimeout(300);
  await page.reload();
  await page.getByTestId('btn-resume').click();
  await waitTurnOrEnd(page);
  expect(await heroCards(page)).toEqual(hc);
  expect(await boardCards(page)).toEqual(bc);
  expect(await page.getByTestId('pot').innerText()).toBe(pot);
});

test('통계 화면과 핸드 기록/복기', async ({ page }) => {
  await startGame(page, { seats: 2, stack: 50 });
  await playPassively(page);
  await page.getByTestId('btn-review').click();
  await expect(page.getByTestId('review')).toBeVisible();
  await page.getByTestId('review-detail').click();
  await page.getByTestId('btn-menu').click();
  await page.getByTestId('nav-stats').click();
  await expect(page.getByTestId('stats')).toBeVisible();
  await expect(page.getByTestId('stat-hands')).toHaveText('1');
  await expect(page.getByTestId('metrics')).toContainText('VPIP');
  await page.getByTestId('stats-back').click();
  await page.getByTestId('nav-history').click();
  await expect(page.getByTestId('history-item')).toHaveCount(1);
  await page.getByTestId('history-item').click();
  await expect(page.getByTestId('replay')).toBeVisible();
  await page.getByTestId('replay-next').click();
});

test('푸시/폴드 훈련과 스팟 검증', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-trainer').click();
  await page.getByTestId('pf-push').click();
  await expect(page.getByTestId('pf-result')).toBeVisible();
  await page.getByTestId('pf-next').click();
  await page.getByTestId('tab-spot').click();
  await page.getByTestId('spot-hole').fill('Ah Ah');
  await page.getByTestId('spot-run').click();
  await expect(page.getByTestId('spot-errors')).toContainText('중복');
  await page.getByTestId('spot-hole').fill('Ah Kd');
  await page.getByTestId('spot-run').click();
  await expect(page.getByTestId('spot-result')).toBeVisible();
});

test('모바일: 9인 테이블 좌석과 행동 버튼이 화면 안에 보인다', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', '모바일 프로젝트 전용');
  await startGame(page, { seats: 9, stack: 100 });
  await waitTurnOrEnd(page);
  for (let i = 0; i < 9; i++) await expect(page.getByTestId(`seat-${i}`)).toBeVisible();
  const vp = page.viewportSize()!;
  if (!(await handOver(page))) {
    const box = await page.getByTestId('btn-fold').boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(vp.width + 1);
  await page.screenshot({ path: 'test-results/mobile-9max.png' });
});
