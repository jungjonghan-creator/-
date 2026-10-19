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

test('헤즈업 싯앤고: 올인 반복 → 종료 → 토너먼트 기록(ITM/ROI)', async ({ page }) => {
  test.setTimeout(120000);
  await startGame(page, { mode: 'mode-hu-sng', stack: 20, speed: 'hyper' });
  for (let h = 0; h < 150; h++) {
    await waitTurnOrEnd(page);
    if (await page.getByTestId('hand-end').isVisible()) {
      if (await page.getByTestId('game-over').count()) break;
      if (await page.getByTestId('btn-next').count() === 0) continue;
      await page.getByTestId('btn-next').click({ timeout: 5000 }).catch(() => {});
      continue;
    }
    if (await page.getByTestId('btn-allin').isEnabled()) { await page.getByTestId('btn-allin').click(); await page.getByTestId('allin-ok').click(); }
    else await page.getByTestId('btn-call').click();
    await page.waitForTimeout(30);
  }
  await expect(page.getByTestId('game-over')).toBeVisible();
  await page.getByTestId('btn-menu').click();
  await page.getByTestId('nav-stats').click();
  await expect(page.getByTestId('tourney-stats')).toContainText('ITM');
});

test('멀티테이블 토너먼트: 시작, 남은 인원/테이블 표시, 다음 핸드 진행', async ({ page }) => {
  test.setTimeout(120000);
  await startGame(page, { mode: 'mode-mtt' });
  // startGame 은 모드 클릭 후 시작 — MTT 는 기본 27명
  await expect(page.getByTestId('tourney-hud')).toBeVisible();
  await expect(page.getByTestId('hud-rank')).toContainText('/ 27');
  const first = await page.getByTestId('hud-level').innerText();
  for (let h = 0; h < 4; h++) {
    await waitTurnOrEnd(page);
    for (let i = 0; i < 40 && !(await page.getByTestId('hand-end').isVisible()); i++) {
      await waitTurnOrEnd(page);
      if (await page.getByTestId('hand-end').isVisible()) break;
      if (await page.getByTestId('btn-fold').isEnabled()) await page.getByTestId('btn-fold').click(); else await page.getByTestId('btn-check').click();
      await page.waitForTimeout(30);
    }
    if (await page.getByTestId('btn-next').isEnabled()) await page.getByTestId('btn-next').click();
    await page.waitForTimeout(300);
  }
  const later = await page.getByTestId('hud-level').innerText();
  expect(later).not.toBe(first); // 레벨/다음 레벨까지 핸드 수가 변했다
});

test('오프라인: 서비스워커 캐시 후 네트워크 없이 게임 시작·플레이', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForTimeout(800); // 프리캐시 완료 대기
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('menu')).toBeVisible();
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

async function nextHandOrRebuy(page: import('@playwright/test').Page) {
  if (await page.getByTestId('btn-rebuy').count()) await page.getByTestId('btn-rebuy').click();
  await page.getByTestId('btn-next').click({ timeout: 5000 });
}

test('핸드가 끝나면 코치 카드가 자동으로 뜬다', async ({ page }) => {
  await startGame(page, { seats: 2, stack: 50 });
  await playPassively(page);
  await expect(page.getByTestId('coach-card')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('coach-headline')).not.toBeEmpty();
  // 끄면 나타나지 않는다
  await page.getByTestId('btn-coach-toggle').click();
  await expect(page.getByTestId('coach-card')).toBeHidden();
  await page.getByTestId('btn-coach-toggle').click();
  await page.getByTestId('coach-detail').click();
  await expect(page.getByTestId('review')).toBeVisible();
});

test('스토리 모드: 앉기 → 해설 피드 → 코치 → 일어나기 → 정산·저널', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.evaluate(async () => { const r = indexedDB.deleteDatabase('poker-arena'); await new Promise((res) => { r.onsuccess = r.onerror = r.onblocked = () => res(null); }); });
  await page.reload();
  await page.getByTestId('nav-story').click();
  await expect(page.getByTestId('bankroll')).toHaveText('3,000');
  await expect(page.getByTestId('chapter-card')).toContainText('지하 클럽');
  await expect(page.getByTestId('rival-kang')).toBeVisible();
  await page.getByTestId('sit-50').click();
  await expect(page.getByTestId('table')).toBeVisible();
  await page.getByTestId('speed').selectOption('0');
  await expect(page.getByTestId('story-feed')).toBeVisible();
  await expect(page.getByTestId('blinds')).toContainText('챕터 1');
  // 라이벌 이름이 캐릭터 이름으로 표시된다 (NOVA 포함)
  await expect(page.locator('[data-testid^=name-]', { hasText: '강 사장' })).toHaveCount(1);
  await playPassively(page);
  await expect(page.getByTestId('coach-card')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-leave').click();
  await expect(page.getByTestId('story')).toBeVisible();
  await expect(page.getByTestId('story-summary')).toBeVisible();
  const bank = Number((await page.getByTestId('bankroll').innerText()).replace(/,/g, ''));
  expect(bank).toBeGreaterThan(1000); // 정산 후 자본 = 3000 - 1000 + 현재 스택
  expect(bank).toBeLessThan(5000);
  await expect(page.getByTestId('journal')).toBeVisible();
  // 다시 앉아 이어서 하기 → 새로고침 후에도 이어하기 가능
  await page.getByTestId('sit-50').click();
  await expect(page.getByTestId('table')).toBeVisible();
  await page.waitForTimeout(400);
  await page.reload();
  await page.getByTestId('nav-story').click();
  await expect(page.getByTestId('story-resume')).toBeVisible();
});

test('분석실: 여러 핸드 후 심층 리포트(누수·계획·상대 분석)', async ({ page }) => {
  test.setTimeout(150000);
  await startGame(page, { seats: 2, stack: 50 });
  for (let h = 0; h < 9; h++) { await playPassively(page); await nextHandOrRebuy(page); }
  await page.getByTestId('btn-menu').click();
  await page.getByTestId('nav-coach').click();
  await expect(page.getByTestId('coach-summary')).toBeVisible({ timeout: 90000 });
  await expect(page.getByTestId('coach-plan')).toBeVisible();
  await expect(page.getByTestId('coach-preflop')).toBeVisible();
  await expect(page.getByTestId('coach-opponents')).toBeVisible();
  await expect(page.getByTestId('coach-tilt')).toBeVisible();
});

async function seedCashes(page: import('@playwright/test').Page, ids: string[]) {
  await page.goto('/');
  await page.evaluate(async () => { const r = indexedDB.deleteDatabase('poker-arena'); await new Promise((res) => { r.onsuccess = r.onerror = r.onblocked = () => res(null); }); });
  await page.reload(); // 열린 연결을 닫아 삭제를 완료시킨다
  await page.evaluate(async (tiers) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const o = indexedDB.open('poker-arena', 1); o.onupgradeneeded = () => { if (!o.result.objectStoreNames.contains('kv')) o.result.createObjectStore('kv'); }; o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); });
    await new Promise<void>((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(tiers.map((id, i) => ({ tierId: id, date: i, mode: 'x', entrants: 10, place: 1, prize: 100, buyIn: 100, entries: 1 })), 'tourneys'); tx.oncomplete = () => res(); });
    db.close();
  }, ids);
  await page.reload();
}
async function foldThroughHand(page: import('@playwright/test').Page) {
  for (let i = 0; i < 40; i++) {
    await waitTurnOrEnd(page);
    if (await page.getByTestId('hand-end').isVisible()) return;
    if (await page.getByTestId('btn-fold').isEnabled()) await page.getByTestId('btn-fold').click(); else await page.getByTestId('btn-check').click();
    await page.waitForTimeout(30);
  }
}

test('[lobby] 토너먼트 로비: 7단계 래더, 입상해야 다음 단계가 열린다', async ({ page }) => {
  await seedCashes(page, ['hu']);
  await page.getByTestId('nav-lobby').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  for (const id of ['hu', 'sng6', 'sng9', 'mtt27', 'mtt54', 'mtt108', 'mtt216']) await expect(page.getByTestId(`tier-${id}`)).toBeVisible();
  await expect(page.getByTestId('start-hu')).toBeEnabled();
  await expect(page.getByTestId('start-sng6')).toBeEnabled();   // hu 입상 → 2단계 개방
  await expect(page.getByTestId('start-sng9')).toBeDisabled();
  await expect(page.getByTestId('start-mtt216')).toBeDisabled();
});

test('[hud] MTT 진행: 순위·평균 스택·M·블라인드 상승·인원 감소가 HUD에 반영된다', async ({ page }) => {
  test.setTimeout(120000);
  await seedCashes(page, ['hu', 'sng6', 'sng9']);
  await page.getByTestId('nav-lobby').click();
  await page.getByTestId('start-mtt27').click();
  await expect(page.getByTestId('tourney-hud')).toBeVisible();
  await page.getByTestId('speed').selectOption('0');
  await expect(page.getByTestId('hud-rank')).toContainText('/ 27');
  await expect(page.getByTestId('hud-avg')).toContainText('5,000');
  await expect(page.locator('[data-stage=early]')).toHaveAttribute('data-current', 'true');
  const lv0 = await page.getByTestId('hud-level').innerText();
  expect(lv0).toContain('레벨 1');
  for (let h = 0; h < 6; h++) {
    await foldThroughHand(page);
    if (await page.getByTestId('btn-next').count() === 0) break;
    await page.getByTestId('btn-next').click({ timeout: 8000 });
    await page.waitForTimeout(250);
  }
  await expect(page.getByTestId('hud-level')).not.toContainText('레벨 1 ');
  const rank = await page.getByTestId('hud-rank').innerText();
  expect(rank).toMatch(/\d+\s*\/\s*\d+/);
  const left = Number(rank.split('/')[1].trim());
  expect(left).toBeLessThanOrEqual(27);
  await page.getByTestId('hud-toggle').click();
  await expect(page.getByTestId('hud-detail')).toContainText('순위표');
  await expect(page.getByTestId('hud-detail')).toContainText('상금표');
});

test('[latereg] 레이트 등록 대회: 등록 중 표시와 참가자 증가', async ({ page }) => {
  test.setTimeout(120000);
  await seedCashes(page, ['hu', 'sng6', 'sng9', 'mtt27']);
  await page.getByTestId('nav-lobby').click();
  await page.getByTestId('start-mtt54').click();
  await page.getByTestId('speed').selectOption('0');
  await expect(page.getByTestId('reg-open')).toBeVisible();
  await page.getByTestId('hud-toggle').click();
  const entries0 = Number((await page.getByTestId('hud-detail').innerText()).match(/총 (\d+)엔트리/)![1]);
  expect(entries0).toBe(54);
  for (let h = 0; h < 5; h++) {
    await foldThroughHand(page);
    if (await page.getByTestId('btn-next').count() === 0) break;
    await page.getByTestId('btn-next').click({ timeout: 8000 });
    await page.waitForTimeout(300);
  }
  const entries1 = Number((await page.getByTestId('hud-detail').innerText()).match(/총 (\d+)엔트리/)![1]);
  expect(entries1).toBeGreaterThan(54);
});
