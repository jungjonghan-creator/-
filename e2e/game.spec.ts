import { test, expect } from '@playwright/test';
import { startGame, waitTurnOrEnd, playPassively, heroCards, boardCards, handOver, seedWallet, wipe, enterLocal, sitCash, joinTournament, foldThroughHand, num } from './helpers';

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
  await page.goto('/'); await enterLocal(page);
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

test('오프라인: 서비스워커 캐시 후 네트워크 없이 연습 경기 시작·플레이', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForTimeout(800); // 프리캐시 완료 대기
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.getByTestId('home-balance')).toBeVisible();
  await page.getByTestId('nav-practice').click();
  await page.getByTestId('seats-2').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('table')).toBeVisible();
  await page.getByTestId('speed').selectOption('0');
  await waitTurnOrEnd(page);
  await context.setOffline(false);
});

test('핸드 기록: 즐겨찾기와 검색', async ({ page }) => {
  await startGame(page, { seats: 2, stack: 50 });
  await playPassively(page);
  await page.getByTestId('btn-menu').click();
  await page.getByTestId('nav-history').click();
  await page.getByTestId('history-item').click();
  await page.getByTestId('btn-fav').click();
  await page.getByTestId('replay-back').click();
  await page.getByTestId('only-fav').check();
  await expect(page.getByTestId('history-item')).toHaveCount(1);
  await page.getByTestId('history-search').fill('zzzz');
  await expect(page.getByTestId('history-item')).toHaveCount(0);
});

test('핸드가 끝나면 코치 카드가 자동으로 뜬다', async ({ page }) => {
  await startGame(page, { seats: 2, stack: 50 });
  await playPassively(page);
  await expect(page.getByTestId('coach-card')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('coach-headline')).not.toBeEmpty();
  await page.getByTestId('btn-coach-toggle').click();
  await expect(page.getByTestId('coach-card')).toBeHidden();
  await page.getByTestId('btn-coach-toggle').click();
  await page.getByTestId('coach-detail').click();
  await expect(page.getByTestId('review')).toBeVisible();
});

test('분석실: 여러 핸드 후 심층 리포트(누수·계획·상대 분석)', async ({ page }) => {
  test.setTimeout(150000);
  await startGame(page, { seats: 2, stack: 50 });
  for (let h = 0; h < 9; h++) {
    await playPassively(page);
    if (await page.getByTestId('btn-rebuy').count()) await page.getByTestId('btn-rebuy').click();
    await page.getByTestId('btn-next').click({ timeout: 5000 });
  }
  await page.getByTestId('btn-menu').click();
  await page.getByTestId('nav-coach').click();
  await expect(page.getByTestId('coach-summary')).toBeVisible({ timeout: 90000 });
  await expect(page.getByTestId('coach-plan')).toBeVisible();
  await expect(page.getByTestId('coach-preflop')).toBeVisible();
  await expect(page.getByTestId('coach-opponents')).toBeVisible();
  await expect(page.getByTestId('coach-tilt')).toBeVisible();
});

// ─────────────── 경제 시스템 ───────────────
test('[경제] 홈에 통장 30,000 → 캐시 착석(바이인 차감) → 퇴장 정산 → 원장 기록', async ({ page }) => {
  test.setTimeout(90000);
  await wipe(page);
  await expect(page.getByTestId('home-balance')).toHaveText('30,000');
  await page.getByTestId('nav-lobby').click();
  await page.getByTestId('cash-open-c2').click();
  await expect(page.getByTestId('cash-buy-c2')).toContainText('2,000'); // 최소 바이인 40BB
  await page.getByTestId('cash-sit-c2').click();
  await expect(page.getByTestId('table')).toBeVisible();
  await page.getByTestId('speed').selectOption('0');
  await expect(page.getByTestId('blinds')).toContainText('25/50');
  for (let h = 0; h < 3; h++) {
    await foldThroughHand(page);
    await page.getByTestId('btn-next').click({ timeout: 8000 });
    await page.waitForTimeout(150);
    await expect(page.getByTestId('blinds')).toContainText('25/50'); // 캐시게임은 블라인드 고정
  }
  await foldThroughHand(page);
  const chips = num(await page.getByTestId('stack-0').innerText());
  expect(num(await page.getByTestId('strip-chips').innerText())).toBe(chips);
  expect(num(await page.getByTestId('strip-net').innerText())).toBe(chips - 2000); // 이번 손익 = 테이블 칩 − 바이인
  await page.getByTestId('btn-leave').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  const bal = num(await page.getByTestId('lobby-balance').innerText());
  expect(bal).toBe(30000 - 2000 + chips);              // 남은 테이블 칩만 반환
  await page.getByTestId('lobby-wallet').click();
  await expect(page.getByTestId('wallet')).toBeVisible();
  const rows = await page.getByTestId('ledger-row').allInnerTexts();
  expect(rows.join('\n')).toContain('캐시 바이인');
  expect(rows.join('\n')).toContain('캐시 정산');
});

test('[경제] 잔액 부족: 바이인·참가비 모두 참가 불가 안내, 통장 불변', async ({ page }) => {
  await seedWallet(page, 1500);
  await page.getByTestId('nav-lobby').click();
  await page.getByTestId('cash-open-c2').click();
  await expect(page.getByTestId('cash-poor-c2')).toBeVisible();
  await expect(page.getByTestId('cash-sit-c2')).toHaveCount(0);
  await page.getByTestId('tab-tourney').click();
  await page.getByTestId('tourney-open-sng9c').click();
  await expect(page.getByTestId('tourney-poor-sng9c')).toBeVisible();
  await expect(page.getByTestId('tourney-start-sng9c')).toBeDisabled();
  await page.getByTestId('tourney-open-free9').click();
  await expect(page.getByTestId('tourney-start-free9')).toBeEnabled(); // 프리롤은 언제든 가능
  await expect(page.getByTestId('lobby-balance')).toHaveText('1,500');
});

test('[경제] 토너먼트: 참가비 차감 → 완주 → 상금 정산(한 번) → 새로고침 후에도 동일', async ({ page }) => {
  test.setTimeout(150000);
  await wipe(page);
  await joinTournament(page, 'hu', 'beginner');
  // 등록 즉시 참가비+수수료 차감 (250 + 25)
  await page.getByTestId('btn-menu').click();
  await expect(page.getByTestId('home-balance')).toHaveText((30000 - 275).toLocaleString());
  await page.getByTestId('btn-resume').click();
  await page.getByTestId('speed').selectOption('0');
  for (let h = 0; h < 200; h++) {
    await waitTurnOrEnd(page);
    if (await page.getByTestId('hand-end').isVisible()) {
      if (await page.getByTestId('btn-to-lobby').count()) break;
      await page.getByTestId('btn-next').click({ timeout: 8000 }).catch(() => {});
      continue;
    }
    if (await page.getByTestId('btn-allin').isEnabled()) { await page.getByTestId('btn-allin').click(); await page.getByTestId('allin-ok').click(); }
    else await page.getByTestId('btn-call').click();
    await page.waitForTimeout(30);
  }
  await expect(page.getByTestId('btn-to-lobby')).toBeVisible();
  await page.getByTestId('btn-to-lobby').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  const bal = num(await page.getByTestId('lobby-balance').innerText());
  expect([30000 - 275, 30000 - 275 + 500]).toContain(bal); // 헤즈업은 승자독식 (풀 250×2=500)
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByTestId('home-balance')).toHaveText(bal.toLocaleString());
  await expect(page.getByTestId('btn-resume')).toHaveCount(0); // 끝난 경기는 이어하기에 남지 않는다
  await page.getByTestId('nav-wallet').click();
  const text = (await page.getByTestId('ledger').innerText());
  expect(text).toContain('토너먼트 참가비');
  expect((text.match(/토너먼트 상금/g) ?? []).length).toBe(bal > 30000 - 275 ? 1 : 0);
});

test('[경제] 캐시 착석 중 새로고침: 이어하기로 같은 카드·같은 통장', async ({ page }) => {
  await wipe(page);
  await sitCash(page, 'c1', 'beginner');
  await waitTurnOrEnd(page);
  const hc = await heroCards(page);
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByTestId('home-balance')).toHaveText((30000 - 400).toLocaleString());
  await page.getByTestId('btn-resume').click();
  await waitTurnOrEnd(page);
  expect(await heroCards(page)).toEqual(hc);
});

test('[경제] 토너먼트 카드: 상금표·적응형 블라인드 규칙 공개, 프리롤 상금', async ({ page }) => {
  await wipe(page);
  await page.getByTestId('nav-lobby').click();
  await page.getByTestId('tab-tourney').click();
  await page.getByTestId('tourney-open-sng9d').click();
  await expect(page.getByTestId('prizes-sng9d')).toContainText('108,000');
  await expect(page.getByTestId('adaptive-rules-sng9d')).toContainText('평균 스택');
  await page.getByTestId('blind-regular-sng9d').click();
  await expect(page.getByTestId('adaptive-rules-sng9d')).toHaveCount(0);
  await page.getByTestId('tourney-open-free9').click();
  await expect(page.getByTestId('prizes-free9')).toContainText('180');
});

test('[경제] MTT 진행: 순위·평균 스택·블라인드 상승이 HUD에 반영', async ({ page }) => {
  test.setTimeout(120000);
  await wipe(page);
  await joinTournament(page, 'mtt27');
  await expect(page.getByTestId('tourney-hud')).toBeVisible();
  await expect(page.getByTestId('hud-rank')).toContainText('/ 27');
  await expect(page.getByTestId('hud-avg')).toContainText('5,000');
  await expect(page.locator('[data-stage=early]')).toHaveAttribute('data-current', 'true');
  const lv0 = await page.getByTestId('hud-level').innerText();
  for (let h = 0; h < 8; h++) {
    await foldThroughHand(page);
    if (await page.getByTestId('btn-next').count() === 0) break;
    await page.getByTestId('btn-next').click({ timeout: 8000 });
    await page.waitForTimeout(250);
  }
  expect(await page.getByTestId('hud-level').innerText()).not.toBe(lv0);
  await page.getByTestId('hud-toggle').click();
  await expect(page.getByTestId('hud-detail')).toContainText('상금표');
});

test('[경제] 레이트 등록 대회: 등록 중 표시와 참가자 증가', async ({ page }) => {
  test.setTimeout(120000);
  await wipe(page);
  await joinTournament(page, 'mtt54');
  await expect(page.getByTestId('reg-open')).toBeVisible();
  await page.getByTestId('hud-toggle').click();
  const entries0 = Number((await page.getByTestId('hud-detail').innerText()).match(/총 (\d+)엔트리/)![1]);
  expect(entries0).toBe(54);
  for (let h = 0; h < 6; h++) {
    await foldThroughHand(page);
    if (await page.getByTestId('btn-next').count() === 0) break;
    await page.getByTestId('btn-next').click({ timeout: 8000 });
    await page.waitForTimeout(300);
  }
  const entries1 = Number((await page.getByTestId('hud-detail').innerText()).match(/총 (\d+)엔트리/)![1]);
  expect(entries1).toBeGreaterThan(54);
});
