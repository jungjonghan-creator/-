import { beforeEach, describe, expect, it } from 'vitest';
import { handle, Env } from '../server/api';
import { openNodeDb } from '../server/nodeDb';
import * as W from '../src/economy/wallet';
import { verifyWallet } from '../src/economy/wallet';

let env: Env; let clock = Date.UTC(2026, 10, 1, 3, 0, 0);
const BASE = 'http://localhost:8787';
beforeEach(() => { env = { DB: openNodeDb(), now: () => clock }; clock = Date.UTC(2026, 10, 1, 3, 0, 0); });

class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await handle(new Request(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'poker-arena', ...(this.cookie ? { cookie: this.cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    return { status: res.status, body: (await res.json()) as any, headers: res.headers };
  }
  get = (p: string) => this.call('GET', p);
  post = (p: string, b?: unknown) => this.call('POST', p, b ?? {});
}
async function signup(name: string, nat = '대한민국'): Promise<Client> {
  const c = new Client();
  const r = await c.post('/api/register', { username: name, password: 'passw0rd-' + name, displayName: name, nationality: nat });
  expect(r.status).toBe(200);
  return c;
}
const sid = (() => { let n = 0; return () => `sid-${++n}`; })();

describe('[서버] 인증', () => {
  it('가입/로그인/로그아웃, 쿠키 속성, 잘못된 비밀번호, 속도 제한', async () => {
    const c = new Client();
    const r = await c.post('/api/register', { username: 'teto', password: 'abcd1234', displayName: 'TETO' });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly/); expect(r.headers.get('set-cookie')).toMatch(/SameSite=Lax/);
    expect((await c.get('/api/me')).body.username).toBe('teto');
    expect((await c.post('/api/register', { username: 'TETO', password: 'abcd1234' })).status).toBe(409); // 대소문자 무시 중복
    expect((await c.post('/api/register', { username: 'x', password: 'abcd1234' })).status).toBe(400);
    expect((await c.post('/api/register', { username: 'okname', password: 'short' })).status).toBe(400);
    await c.post('/api/logout'); expect((await c.get('/api/me')).status).toBe(401);
    const d = new Client();
    expect((await d.post('/api/login', { username: 'teto', password: 'wrong-pass' })).status).toBe(401);
    expect((await d.post('/api/login', { username: 'teto', password: 'abcd1234' })).status).toBe(200);
    // 8회 실패 후 잠금
    const e = new Client();
    for (let i = 0; i < 8; i++) await e.post('/api/login', { username: 'nobody', password: 'wrongwrong' });
    expect((await e.post('/api/login', { username: 'nobody', password: 'wrongwrong' })).status).toBe(429);
  });
  it('CSRF: 사용자 정의 헤더 없는 쓰기 요청은 거부, 비밀번호는 평문 저장되지 않는다', async () => {
    const res = await handle(new Request(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'evil', password: 'abcd1234' }) }), env);
    expect(res.status).toBe(403);
    await signup('safe');
    const row = (env.DB as any).raw.prepare('SELECT password_hash, salt, iterations FROM accounts WHERE username=?').get('safe');
    expect(row.password_hash).not.toContain('passw0rd'); expect(row.iterations).toBeGreaterThanOrEqual(100000);
  });
});

describe('[서버] 지갑/정산', () => {
  it('SNG 입장→정산: 상금 한 번만, 10회 재요청해도 동일, 원장 검산', async () => {
    const c = await signup('a1');
    const s = sid();
    const open = await c.post('/api/entry', { sid: s, source: 'catalog', defId: 'sng9b' });
    expect(open.status).toBe(200); expect(open.body.wallet.balance).toBe(30000 - 1100);
    // 입장 재요청도 한 번만 차감
    expect((await c.post('/api/entry', { sid: s, source: 'catalog', defId: 'sng9b' })).body.wallet.balance).toBe(28900);
    const r1 = await c.post('/api/entry/settle', { sid: s, place: 1, totalEntries: 9, hands: 40 });
    expect(r1.status).toBe(200); expect(r1.body.result.prize).toBe(5400);
    for (let i = 0; i < 10; i++) { const r = await c.post('/api/entry/settle', { sid: s, place: 3, totalEntries: 9, hands: 40 }); expect(r.body.result.prize).toBe(5400); }
    const st = await c.get('/api/state');
    expect(st.body.wallet.balance).toBe(28900 + 5400);
    expect(verifyWallet(st.body.wallet)).toEqual([]);
    expect(st.body.wallet.txs.filter((t: any) => t.kind === 'tourney-prize').length).toBe(1);
  });
  it('동시 정산 요청(2탭)도 한 번만 지급', async () => {
    const c = await signup('a2'); const s = sid();
    await c.post('/api/entry', { sid: s, source: 'catalog', defId: 'sng9b' });
    const rs = await Promise.all(Array.from({ length: 6 }, () => c.post('/api/entry/settle', { sid: s, place: 2, totalEntries: 9, hands: 30 })));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    const st = await c.get('/api/state');
    expect(st.body.wallet.txs.filter((t: any) => t.kind === 'tourney-prize').length).toBe(1);
    expect(st.body.wallet.balance).toBe(30000 - 1100 + 2700);
    expect(verifyWallet(st.body.wallet)).toEqual([]);
  });
  it('ITM 탈락(3위)은 즉시 정산, 버블(4위)은 0', async () => {
    const c = await signup('a3'); const s = sid(); const s2 = sid();
    await c.post('/api/entry', { sid: s, source: 'catalog', defId: 'sng9b' });
    expect((await c.post('/api/entry/settle', { sid: s, place: 3, totalEntries: 9, hands: 30 })).body.result.prize).toBe(900);
    await c.post('/api/entry', { sid: s2, source: 'catalog', defId: 'sng9b' });
    expect((await c.post('/api/entry/settle', { sid: s2, place: 4, totalEntries: 9, hands: 30 })).body.result.prize).toBe(0);
  });
  it('잘못된 보고(순위>인원, 인원 상한 초과)는 거부되고 잔액은 그대로', async () => {
    const c = await signup('a4'); const s = sid();
    await c.post('/api/entry', { sid: s, source: 'catalog', defId: 'sng9b' });
    expect((await c.post('/api/entry/settle', { sid: s, place: 12, totalEntries: 9, hands: 30 })).status).toBe(400);
    expect((await c.post('/api/entry/settle', { sid: s, place: 1, totalEntries: 900, hands: 30 })).status).toBe(400);
    expect((await c.get('/api/state')).body.wallet.balance).toBe(28900);
  });
  it('진행 중인 경기가 있으면 새 경기 불가, 잔액 부족이면 입장 불가', async () => {
    const c = await signup('a5');
    expect((await c.post('/api/entry', { sid: sid(), source: 'world', defId: 'jeju-super' })).status).toBe(200); // 11,000
    expect((await c.post('/api/entry', { sid: sid(), source: 'catalog', defId: 'sng9b' })).body.code).toBe('open_exists');
    const d = await signup('a5b'); const s1 = sid();
    await d.post('/api/entry', { sid: s1, source: 'world', defId: 'macau-1' }); // 11,000
    await d.post('/api/entry/settle', { sid: s1, place: 99, totalEntries: 137, hands: 50 });
    await d.post('/api/entry', { sid: sid(), source: 'world', defId: 'macau-2' }).then((r) => expect(r.status).toBe(200)); // 19,000 남음 → 가능
    expect((await d.get('/api/state')).body.wallet.balance).toBe(30000 - 11000 - 11000);
    await d.post('/api/entry/abandon', { sid: (await d.get('/api/state')).body.openEntries[0].sid });
    expect((await d.post('/api/entry', { sid: sid(), source: 'world', defId: 'gli-inv' })).body.code).toBe('wallet'); // 27,500 > 8,000
  });
  it('일일 무료 충전: KST 하루 한 번, 다중 탭 중복 불가, 상한 적용', async () => {
    const c = await signup('a6'); const s = sid();
    // 30,000 보유 = 상한 → 지급 없음
    expect((await c.post('/api/wallet/daily')).body.granted).toBe(0);
    await c.post('/api/entry', { sid: s, source: 'catalog', defId: 'sng9b' });
    await c.post('/api/entry/settle', { sid: s, place: 9, totalEntries: 9, hands: 30 }); // -1,100
    const rs = await Promise.all([c.post('/api/wallet/daily'), c.post('/api/wallet/daily'), c.post('/api/wallet/daily')]);
    const total = rs.reduce((a, r) => a + r.body.granted, 0);
    expect(total).toBe(1100); // 상한까지만 한 번
    expect((await c.get('/api/state')).body.wallet.txs.filter((t: any) => t.kind === 'daily-grant').length).toBe(1);
    clock += 24 * 3600_000; // 다음 KST 날: 이미 상한
    expect((await c.post('/api/wallet/daily')).body.granted).toBe(0);
  });
  it('캐시: 입장/탑업/퇴장 + 중복 요청', async () => {
    const c = await signup('a7'); const s = sid();
    expect((await c.post('/api/cash/open', { sid: s, tableId: 'c2', buyIn: 3000 })).body.wallet.balance).toBe(27000);
    expect((await c.post('/api/cash/open', { sid: s, tableId: 'c2', buyIn: 3000 })).body.wallet.balance).toBe(27000);
    await c.post('/api/cash/topup', { sid: s, opId: 'h1', amount: 1000, currentChips: 2000 });
    await c.post('/api/cash/topup', { sid: s, opId: 'h1', amount: 1000, currentChips: 2000 });
    expect((await c.get('/api/state')).body.wallet.balance).toBe(26000);
    await c.post('/api/cash/close', { sid: s, chips: 5000 });
    await c.post('/api/cash/close', { sid: s, chips: 5000 });
    const st = await c.get('/api/state');
    expect(st.body.wallet.balance).toBe(31000);
    expect(verifyWallet(st.body.wallet)).toEqual([]);
  });
  it('다른 계정의 대회를 정산/조회할 수 없다', async () => {
    const a = await signup('p1'); const b = await signup('p2'); const s = sid();
    await a.post('/api/entry', { sid: s, source: 'catalog', defId: 'sng9b' });
    expect((await b.post('/api/entry/settle', { sid: s, place: 1, totalEntries: 9, hands: 30 })).status).toBe(404);
    expect((await b.get('/api/state')).body.wallet.balance).toBe(30000);
  });
});

describe('[서버] 통합 랭킹 · 가족 3계정 (RANKING_MODEL_v2 자동 테스트 1~8)', () => {
  const play = async (c: Client, eventId: string, place: number, field: number) => {
    const s = sid();
    const o = await c.post('/api/entry', { sid: s, source: 'world', defId: eventId });
    expect(o.status).toBe(200);
    return c.post('/api/entry/settle', { sid: s, place, totalEntries: field, hands: 60 });
  };
  it('1~3 가입 즉시 등록부에 `미참가`, 같은 랭킹에 AI와 섞여 보인다', async () => {
    const A = await signup('teto'); const B = await signup('brother'); const C = await signup('family');
    const r = await A.get('/api/ranking?scope=long&limit=5&kinds=human');
    expect(r.body.humans).toBe(3); expect(r.body.ais).toBeGreaterThan(1000);
    const all = await A.get('/api/ranking?scope=long&limit=200&kinds=human');
    expect(all.body.rows.map((x: any) => x.name).sort()).toEqual(['brother', 'family', 'teto']);
    expect(all.body.rows.every((x: any) => x.unranked && x.points === 0)).toBe(true);
    const mixed = await A.get('/api/ranking?scope=long&limit=30');
    expect(mixed.body.rows.some((x: any) => x.kind === 'ai-legend')).toBe(true);
    // 엘키·홍진호 등 주요 AI 검색
    const s = await A.get('/api/ranking?scope=all&q=ElkY&limit=5'); expect(s.body.rows[0].name).toContain('ElkY');
  });
  it('3·5·6 B가 공식 이벤트 완료 → A가 보는 랭킹에 B 점수 반영, 공식 AI 기록은 불변, 10회 재요청도 1회 적립', async () => {
    const A = await signup('teto'); const B = await signup('brother'); await signup('family');
    const before = await A.get('/api/ranking?scope=season&limit=1&kinds=ai');
    const res = await play(B, 'seoul-main', 3, 450);
    expect(res.body.ranked).toBe(true); expect(res.body.points).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) await B.post('/api/entry/settle', { sid: 'sid-' + (Number(sid().slice(4)) - 1), place: 1, totalEntries: 450, hands: 60 });
    const view = await A.get('/api/ranking?scope=season&limit=200&kinds=human');
    const brother = view.body.rows.find((x: any) => x.name === 'brother');
    expect(brother.points).toBeGreaterThan(0); expect(brother.events).toBe(1); expect(brother.rank).toBe(1);
    expect(view.body.rows.find((x: any) => x.name === 'teto').unranked).toBe(true);
    const ledger = (env.DB as any).raw.prepare('SELECT COUNT(*) c FROM points_ledger').get();
    expect(ledger.c).toBe(1);
    // AI 공식 세계 기록은 변하지 않는다
    const after = await A.get('/api/ranking?scope=season&limit=1&kinds=ai');
    expect(after.body.rows[0].points).toBe(before.body.rows[0].points);
  });
  it('통합 정렬: 높은 순위 인간은 AI 사이에 끼고, 동점은 공동 순위, 같은 이벤트 재도전은 최고 성적 1건만', async () => {
    const A = await signup('teto');
    await play(A, 'seoul-main', 40, 450);
    const p1 = (await A.get('/api/ranking/me')).body.world.row.points;
    await play(A, 'seoul-main', 2, 450); // 같은 이벤트 재도전 → 더 좋은 성적
    const p2 = (await A.get('/api/ranking/me')).body.world.row.points;
    expect(p2).toBeGreaterThan(p1);
    await play(A, 'seoul-main', 100, 450); // 더 나쁜 성적 → 점수 유지
    expect((await A.get('/api/ranking/me')).body.world.row.points).toBe(p2);
    const me = (await A.get('/api/ranking/me')).body;
    expect(me.world.rank).toBeGreaterThan(0); expect(me.kr.rank).toBeGreaterThan(0); expect(me.kr.rank).toBeLessThanOrEqual(me.world.rank);
  });
  it('4 지갑·핸드·세션은 다른 계정에 노출되지 않는다 / 비공개 프로필은 익명 표기', async () => {
    const A = await signup('teto'); const C = await signup('family');
    await C.post('/api/profile', { publicProfile: false });
    await play(C, 'seoul-main', 5, 450);
    const v = await A.get('/api/ranking?scope=season&kinds=human&limit=10');
    expect(JSON.stringify(v.body)).not.toContain('family');
    expect(v.body.rows.some((x: any) => x.name === '비공개 선수')).toBe(true);
    expect((await A.get('/api/state')).body.wallet.txs.length).toBe(1);
    expect((await new Client().get('/api/state')).status).toBe(401);
  });
  it('친구·가족 그룹: 초대 코드로만 구성, 그룹 랭킹은 구성원에게만', async () => {
    const A = await signup('teto'); const B = await signup('brother'); const C = await signup('family');
    const g = await A.post('/api/groups', { name: '우리 가족' });
    expect((await C.get(`/api/ranking?group=${g.body.id}`)).status).toBe(403);
    expect((await B.post('/api/groups/join', { code: g.body.code })).status).toBe(200);
    await play(B, 'seoul-main', 10, 450);
    const r = await A.get(`/api/ranking?group=${g.body.id}&scope=season`);
    expect(r.body.total).toBe(2); expect(r.body.rows[0].name).toBe('brother');
    expect((await B.get('/api/groups')).body.groups[0].code).toBeUndefined(); // 코드는 방장만
  });
  it('7 100명 계정 + 1,000+ AI: 총원·페이지네이션·검색 정상 (90명 제한 없음)', async () => {
    const A = await signup('teto');
    const raw = (env.DB as any).raw;
    for (let i = 0; i < 100; i++) {
      raw.prepare("INSERT INTO accounts(id, username, display_name, password_hash, salt, iterations, nationality, public_profile, created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(`u${i}`, `user${i}`, `사용자${i}`, 'x', 'y', 1, '대한민국', 1, clock);
      raw.prepare("INSERT INTO global_roster(entity_key, kind, stable_id, display_name, nationality, created_at) VALUES (?,?,?,?,?,?)").run(`human:u${i}`, 'human', `u${i}`, `사용자${i}`, '대한민국', clock);
    }
    const r = await A.get('/api/ranking?scope=all&limit=50');
    expect(r.body.humans).toBe(101); expect(r.body.ais).toBeGreaterThanOrEqual(1500); expect(r.body.total).toBe(r.body.registered);
    const seen = new Set<string>();
    for (let off = 0; off < r.body.total; off += 200) { const p = await A.get(`/api/ranking?scope=all&limit=200&offset=${off}`); for (const x of p.body.rows) seen.add(x.key); }
    expect(seen.size).toBe(r.body.total);
    expect((await A.get('/api/ranking?scope=all&q=사용자7&limit=50')).body.total).toBeGreaterThan(5);
  });
  it('8 무료 충전·연습·캐시·카탈로그 대회로는 랭킹 점수가 오르지 않는다', async () => {
    const A = await signup('teto'); const s = sid();
    await A.post('/api/wallet/daily');
    await A.post('/api/entry', { sid: s, source: 'catalog', defId: 'sng9b' });
    const r = await A.post('/api/entry/settle', { sid: s, place: 1, totalEntries: 9, hands: 40 });
    expect(r.body.ranked).toBe(false);
    expect((await A.get('/api/ranking/me')).body.world.row.unranked).toBe(true);
  });
  it('새틀라이트 우승 → 티켓 1회 발행, 티켓으로 메인 이벤트 입장(차감 없음), 티켓 재사용 불가', async () => {
    const A = await signup('teto');
    const s = sid();
    await A.post('/api/entry', { sid: s, source: 'world', defId: 'vss-sat1' });
    const r1 = await A.post('/api/entry/settle', { sid: s, place: 1, totalEntries: 110, hands: 60 });
    expect(r1.body.ticket).toBeTruthy();
    await A.post('/api/entry/settle', { sid: s, place: 1, totalEntries: 110, hands: 60 });
    expect((await A.get('/api/state')).body.tickets.length).toBe(1);
    const m = sid(); const bal = (await A.get('/api/state')).body.wallet.balance;
    const o = await A.post('/api/entry', { sid: m, source: 'world', defId: 'vss-main', useTicket: true });
    expect(o.status).toBe(200); expect(o.body.wallet.balance).toBe(bal);
    await A.post('/api/entry/settle', { sid: m, place: 500, totalEntries: 3000, hands: 90 });
    expect((await A.post('/api/entry', { sid: sid(), source: 'world', defId: 'vss-main', useTicket: true })).status).toBe(409);
  });
  it('클라우드 저장: 버전 충돌 감지, 큰 데이터 분할 저장', async () => {
    const A = await signup('teto');
    const big = 'x'.repeat(1_300_000);
    const r1 = await A.call('PUT', '/api/save', { slot: 'main', version: 0, data: big }); expect(r1.body.version).toBe(1);
    expect((await A.call('PUT', '/api/save', { slot: 'main', version: 0, data: 'y' })).status).toBe(409);
    const g = await A.get('/api/save?slot=main'); expect(g.body.data.length).toBe(big.length);
  });
});
