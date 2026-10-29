import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';

test.use({ baseURL: 'http://localhost:8787' });
const uid = () => Math.random().toString(36).slice(2, 8);
const PW = 'passw0rd-e2e';

async function register(page: Page, username: string, display: string) {
  await page.goto('/');
  await expect(page.getByTestId('auth')).toBeVisible();
  await page.getByTestId('auth-tab-register').click();
  await page.getByTestId('auth-user').fill(username);
  await page.getByTestId('auth-pass').fill(PW);
  await page.getByTestId('auth-pass2').fill(PW);
  await page.getByTestId('auth-name').fill(display);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('menu')).toBeVisible();
}
async function login(page: Page, username: string) {
  await page.goto('/');
  await page.getByTestId('auth-user').fill(username);
  await page.getByTestId('auth-pass').fill(PW);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('menu')).toBeVisible();
}
const balance = async (page: Page) => Number((await page.getByTestId('home-balance').innerText()).replace(/,/g, ''));
async function newUser(browser: Browser, name: string): Promise<{ ctx: BrowserContext; page: Page; username: string }> {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const username = `${name}_${uid()}`;
  await register(page, username, username);
  return { ctx, page, username };
}
const act = async (page: Page, id: string) => { const b = page.getByTestId(id); if ((await b.isVisible()) && (await b.isEnabled())) { await b.click(); return true; } return false; };
/** 폴드/체크만 하며 정산 패널이 보일 때까지 진행 */
async function foldUntilSettled(page: Page, limit = 1500, shove = true) {
  for (let i = 0; i < limit; i++) {
    if (await page.getByTestId('settle-done').isVisible()) return;
    if (await page.getByTestId('settle-error').isVisible()) throw new Error('정산 오류 표시');
    if (await page.getByTestId('btn-decline').isVisible()) { await page.getByTestId('btn-decline').click(); continue; }
    if (shove && (await act(page, 'btn-allin'))) { const ok = page.getByTestId('allin-ok'); await ok.waitFor({ timeout: 5000 }); await ok.click(); continue; }
    if (await act(page, 'btn-fold')) continue;
    if (await act(page, 'btn-check')) continue;
    const nxt = page.getByTestId('btn-next');
    if (await nxt.isVisible() && await nxt.isEnabled()) { await nxt.click(); continue; }
    await page.waitForTimeout(120);
  }
  throw new Error('정산 패널이 나타나지 않음');
}

test('가입 → 로그아웃 → 로그인, 잘못된 비밀번호, 서버 모드 표시', async ({ browser }) => {
  const { ctx, page, username } = await newUser(browser, 'auth');
  await expect(page.getByTestId('nav-account')).toContainText('서버 저장');
  await page.getByTestId('nav-account').click();
  await page.getByTestId('btn-logout').click();
  await expect(page.getByTestId('auth')).toBeVisible();
  await page.getByTestId('auth-user').fill(username); await page.getByTestId('auth-pass').fill('wrong-password');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toBeVisible();
  await page.getByTestId('auth-pass').fill(PW); await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  expect(await balance(page)).toBe(30000);
  await ctx.close();
});

test('월드 대회 완주: 서버 확정 정산이 한 번만 반영되고 새로고침·재로그인 후에도 같다', async ({ browser }) => {
  test.setTimeout(150000);
  const { ctx, page, username } = await newUser(browser, 'play');
  await page.getByTestId('nav-world').click();
  await page.getByTestId('event-open-kcl-m1').click();
  await expect(page.getByTestId('event-prizes-kcl-m1')).toBeVisible();
  await page.getByTestId('event-enter-kcl-m1').click();
  await expect(page.getByTestId('table')).toBeVisible();
  await page.getByTestId('speed').selectOption('0');
  await foldUntilSettled(page);
  await expect(page.getByTestId('settle-done')).toContainText('서버 확정');
  await page.getByTestId('btn-ledger').click();
  await expect(page.getByTestId('ledger-verify')).toContainText('검산 통과');
  const rows = await page.getByTestId('ledger-row').count();
  const bal = Number((await page.getByTestId('wallet').getByText(/보유 크레딧/).locator('..').locator('div').nth(1).innerText()).replace(/,/g, ''));
  await page.reload();
  await expect(page.getByTestId('menu')).toBeVisible();
  const after = await balance(page);
  expect(after).toBe(bal);
  // 다른 기기(새 컨텍스트)에서 로그인해도 동일
  const c2 = await browser.newContext(); const p2 = await c2.newPage();
  await login(p2, username);
  expect(await balance(p2)).toBe(after);
  await p2.getByTestId('nav-wallet2').click();
  expect(await p2.getByTestId('ledger-row').count()).toBe(rows);
  await c2.close(); await ctx.close();
});

test('헤즈업 토너먼트표(단계형): 1라운드 매치 후 공동 순위로 정산', async ({ browser }) => {
  test.setTimeout(150000);
  const { ctx, page } = await newUser(browser, 'hu');
  await page.getByTestId('nav-world').click();
  await page.getByTestId('event-open-seoul-hu-hyper').click();
  await expect(page.getByTestId('event-reason-seoul-hu-hyper')).toHaveCount(0);
  await page.getByTestId('event-enter-seoul-hu-hyper').click();
  await expect(page.getByTestId('table')).toBeVisible();
  await page.getByTestId('speed').selectOption('0');
  await foldUntilSettled(page, 600);
  await expect(page.getByTestId('settle-done')).toContainText('/ 32명');
  await expect(page.getByTestId('staged-final')).toBeVisible();
  await ctx.close();
});

test('가족 3계정: 같은 통합 랭킹에 AI와 함께 등록, B의 공식 성적이 A 화면에 반영, C의 지갑은 독립', async ({ browser }) => {
  const A = await newUser(browser, 'teto'); const B = await newUser(browser, 'bro'); const C = await newUser(browser, 'fam');
  // A 가 그룹을 만들고 B·C 가 코드로 참여
  await A.page.getByTestId('nav-ranking').click();
  await A.page.getByTestId('rank-tab-friends').click();
  await A.page.getByTestId('group-name').fill('우리 가족');
  await A.page.getByTestId('group-create').click();
  await expect(A.page.getByTestId('group-msg')).toContainText('초대 코드');
  const code = (await A.page.getByTestId('group-msg').innerText()).split('초대 코드:')[1].trim();
  for (const u of [B, C]) {
    await u.page.getByTestId('nav-ranking').click(); await u.page.getByTestId('rank-tab-friends').click();
    await u.page.getByTestId('group-code').fill(code); await u.page.getByTestId('group-join').click();
    await expect(u.page.getByTestId('group-msg')).toContainText('참여했습니다');
  }
  // 세 계정 모두 실제 사용자 랭킹에 `미참가 · 0점` 으로 보인다
  await A.page.getByTestId('rank-tab-humans').click();
  await A.page.getByTestId('rank-search').fill(A.username);
  await expect(A.page.getByTestId(`rank-list`)).toContainText('미참가 · 0점');
  // 통합(세계) 랭킹에는 레전드 AI 와 일반 AI 가 섞여 있고 등록 인원은 1,000명을 넘는다
  await A.page.getByTestId('rank-tab-world').click(); await A.page.getByTestId('rank-search').fill('');
  await A.page.getByTestId('rank-scope').selectOption('long');
  await expect(A.page.getByTestId('rank-meta')).toContainText('등록 선수');
  const meta = await A.page.getByTestId('rank-meta').innerText();
  expect(Number(meta.match(/등록 선수 ([\d,]+)명/)![1].replace(/,/g, ''))).toBeGreaterThan(1500);
  await expect(A.page.getByTestId('rank-list')).toContainText('실존 레전드 AI');
  // B 의 공식 성적(서버 검증 경로)을 API 로 주입: 하네스 — UI 완주는 위 테스트가 검증
  const sid = `e2e-${uid()}`;
  const o = await B.page.request.post('/api/entry', { headers: { 'x-requested-with': 'poker-arena' }, data: { sid, source: 'world', defId: 'seoul-main' } });
  expect(o.ok()).toBeTruthy();
  const s = await B.page.request.post('/api/entry/settle', { headers: { 'x-requested-with': 'poker-arena' }, data: { sid, place: 2, totalEntries: 450, hands: 120 } });
  expect((await s.json()).points).toBeGreaterThan(0);
  for (let i = 0; i < 5; i++) await B.page.request.post('/api/entry/settle', { headers: { 'x-requested-with': 'poker-arena' }, data: { sid, place: 2, totalEntries: 450, hands: 120 } });
  // A 가 새로고침하면 B 의 점수와 순위가 그룹 랭킹에 반영된다
  await A.page.reload();
  await expect(A.page.getByTestId('menu')).toBeVisible();
  await A.page.getByTestId('nav-ranking').click();
  await A.page.getByTestId('rank-tab-friends').click();
  await A.page.getByTestId(`group-우리 가족`).click();
  await expect(A.page.getByTestId('rank-list')).toContainText(B.username);
  const first = A.page.getByTestId('rank-list').locator('li').first();
  await expect(first).toContainText(B.username);
  await expect(first).toContainText('이벤트 1');
  // 세계 순위에서도 B 가 AI 사이에 끼어 있다 (점수 적립됨)
  await A.page.getByTestId('rank-tab-humans').click();
  await expect(A.page.getByTestId('rank-list').locator('li').first()).toContainText(B.username);
  // C 는 지갑·기록이 독립적이다
  await C.page.getByTestId('ranking-back').click();
  expect(await balance(C.page)).toBe(30000);
  await B.page.reload(); await expect(B.page.getByTestId('menu')).toBeVisible();
  expect(await balance(B.page)).toBeGreaterThan(30000); // 450명 대회 2위 상금(서버 상금표)이 한 번만 지급됨
  for (const u of [A, B, C]) await u.ctx.close();
});

test('다른 기기에서 이어하기: 진행 중인 경기가 클라우드 저장으로 복원된다', async ({ browser }) => {
  const { ctx, page, username } = await newUser(browser, 'cloud');
  await page.getByTestId('nav-world').click();
  await page.getByTestId('event-open-kcl-m1').click();
  await page.getByTestId('event-enter-kcl-m1').click();
  await expect(page.getByTestId('table')).toBeVisible();
  await page.getByTestId('speed').selectOption('0');
  // 몇 핸드 진행
  for (let i = 0; i < 6; i++) {
    if (await act(page, 'btn-fold')) { /* 폴드 */ } else if (await act(page, 'btn-check')) { /* 체크 */ } else if (await act(page, 'btn-next')) { /* 다음 */ }
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(6500); // 클라우드 저장 디바운스(5초) 대기
  const c2 = await browser.newContext(); const p2 = await c2.newPage();
  await login(p2, username);
  await expect(p2.getByTestId('btn-resume')).toBeVisible({ timeout: 15000 });
  await p2.getByTestId('btn-resume').click();
  await expect(p2.getByTestId('table')).toBeVisible();
  await c2.close(); await ctx.close();
});

test('모바일 360px: 로그인·메뉴·월드·랭킹·도감에 가로 스크롤이 없다', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const username = `mob_${uid()}`;
  await register(page, username, username);
  const overflow = async () => page.evaluate(() => { const els = [document.documentElement, ...Array.from(document.querySelectorAll('[data-testid]'))]; return els.filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').map((e) => e.getAttribute('data-testid') ?? e.tagName).slice(0, 5); });
  expect(await overflow()).toEqual([]);
  for (const nav of ['nav-world', 'nav-ranking', 'nav-dex', 'nav-news']) {
    await page.getByTestId(nav).click();
    await page.waitForTimeout(300);
    expect(await overflow(), nav).toEqual([]);
    await page.getByRole('button', { name: /뒤로/ }).first().click();
    await expect(page.getByTestId('menu')).toBeVisible();
  }
  await ctx.close();
});

test('초대 링크: 링크로 들어와 가입하면 자동으로 그룹에 참여 (?join=코드)', async ({ browser }) => {
  const A = await newUser(browser, 'host');
  await A.page.getByTestId('nav-ranking').click();
  await A.page.getByTestId('rank-tab-friends').click();
  await A.page.getByTestId('group-name').fill('초대방');
  await A.page.getByTestId('group-create').click();
  await expect(A.page.getByTestId('group-invite-초대방')).toBeVisible();
  const code = (await A.page.getByTestId('group-msg').innerText()).split('초대 코드:')[1].trim();
  // 새 기기(새 컨텍스트)에서 링크를 연다
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(`/?join=${code}`);
  await expect(page.getByTestId('auth-invite')).toBeVisible();
  expect(new URL(page.url()).search).toBe(''); // 주소에서 코드 제거
  const username = `inv_${uid()}`;
  await page.getByTestId('auth-user').fill(username);
  await page.getByTestId('auth-pass').fill(PW);
  await page.getByTestId('auth-pass2').fill(PW);
  await page.getByTestId('auth-name').fill(username);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.getByTestId('invite-banner')).toContainText('참여했습니다');
  await page.getByTestId('nav-ranking').click(); await page.getByTestId('rank-tab-friends').click();
  await expect(page.getByTestId('group-초대방')).toContainText('2명');
  // 잘못된 코드는 조용히 실패하고 앱은 정상
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
  await p2.goto('/?join=ZZZZZZZZ');
  const u2 = `bad_${uid()}`;
  await p2.getByTestId('auth-user').fill(u2); await p2.getByTestId('auth-pass').fill(PW); await p2.getByTestId('auth-pass2').fill(PW); await p2.getByTestId('auth-name').fill(u2); await p2.getByTestId('auth-submit').click();
  await expect(p2.getByTestId('menu')).toBeVisible();
  await expect(p2.getByTestId('invite-banner')).toContainText('쓸 수 없습니다');
  await A.ctx.close(); await ctx.close(); await ctx2.close();
});
