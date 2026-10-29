/**
 * POKER ARENA 서버 API (Cloudflare Worker / node 공용 fetch 핸들러).
 * 원칙: 클라이언트가 보낸 잔액·상금·점수는 믿지 않는다. 상금은 서버가 상금표에서 계산하고, 순위 점수는 서버가 공개 규칙으로 계산한다.
 * 한계(문서화): 대회 진행 자체는 클라이언트 엔진이 하므로 서버는 "보고된 순위"의 일관성(범위·1회성·상금표)만 검증한다.
 */
import * as W from '../src/economy/wallet';
import { CASH_TABLES, TOURNAMENTS, TournamentDef, sngPrizeTable } from '../src/economy/catalog';
import { payoutStructure } from '../src/game/icm';
import { EVENT_TEMPLATES, EventDef, SEASON_GROWTH, WORLD_ANCHOR_DAY, worldDay } from '../src/world/calendar';
import { prizeAtPlace, prizeStructure, ticketsFor } from '../src/world/prizes';
import { eventPoints } from '../src/world/points';
import { RULES_VERSION, isRankedEvent, Entity, HumanResult, buildPointRows, computeRanking, describeRules, PointRow, RankQuery } from '../src/world/rankings';
import { aiEntities, ALL_RANKED } from '../src/world/field';
import snapshotJson from '../src/world/data/season.json';
import type { WorldSnapshot } from '../src/world/season';
import { absDay } from '../src/world/points';
import type { Db, Stmt } from './db';
import { SCHEMA } from './schema';
import { PBKDF2_ITERATIONS, hashPassword, randomB64, randomId, safeEqual, sha256Hex } from './crypto';
import { createWallet, loadWallet, mutateWallet, RecoveryRequired } from './walletStore';

export interface Env { DB: Db; /** 테스트용 시간 주입 */ now?: () => number; /** 새 계정의 PBKDF2 반복 횟수(기본 100,000 = Workers 상한). 계정마다 저장되므로 나중에 올려도 기존 계정은 그대로 동작 */ iterations?: number }

const SNAP = snapshotJson as unknown as WorldSnapshot;
const SESSION_DAYS = 30;
const COOKIE = 'pa_session';
const TEMPLATE = new Map(EVENT_TEMPLATES.map((e) => [e.id, e] as const));
const CURRENT_SEASON = 2035;

class HttpError extends Error { constructor(public status: number, msg: string, public code = 'error') { super(msg); } }
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

// ───────── 스키마 ─────────
const migrated = new WeakSet<object>();
export async function migrate(db: Db) {
  if (migrated.has(db as object)) return;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  migrated.add(db as object);
}

// ───────── 인증 ─────────
const USERNAME_RE = /^[A-Za-z0-9_가-힣]{2,20}$/;
interface Account { id: string; username: string; display_name: string; nationality: string; public_profile: number; created_at: number }

async function parseCookies(req: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') ?? '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
async function auth(req: Request, env: Env, now: number): Promise<Account | null> {
  const tok = (await parseCookies(req))[COOKIE] ?? (req.headers.get('authorization')?.replace(/^Bearer /i, '') || '');
  if (!tok) return null;
  const th = await sha256Hex(tok);
  const row = await env.DB.prepare('SELECT a.id, a.username, a.display_name, a.nationality, a.public_profile, a.created_at, s.expires_at FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND a.deleted_at IS NULL').bind(th).first<Account & { expires_at: number }>();
  if (!row || row.expires_at < now) return null;
  return row;
}
const requireAuth = async (req: Request, env: Env, now: number) => { const a = await auth(req, env, now); if (!a) throw new HttpError(401, '로그인이 필요합니다', 'unauthorized'); return a; };

function sessionCookie(token: string, maxAgeSec: number, secure: boolean) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}
const isSecure = (req: Request) => new URL(req.url).protocol === 'https:';

async function audit(env: Env, now: number, accountId: string | null, action: string, detail = '') {
  await env.DB.prepare('INSERT INTO audit(ts, account_id, action, detail) VALUES (?,?,?,?)').bind(now, accountId, action, detail.slice(0, 500)).run();
}

// ───────── 랭킹 캐시 ─────────
let aiPoints: Map<string, PointRow[]> | null = null;
let aiEnts: Map<string, Entity> | null = null;
function aiBase() {
  if (!aiEnts) aiEnts = aiEntities();
  if (!aiPoints) aiPoints = buildPointRows(SNAP, aiEnts, SNAP.roster, []);
  return { ents: aiEnts, points: aiPoints };
}

async function rankingData(env: Env) {
  const { ents: baseEnts, points: basePoints } = aiBase();
  const ents = new Map(baseEnts);
  const humans = (await env.DB.prepare('SELECT g.entity_key, g.display_name, g.nationality, a.public_profile FROM global_roster g JOIN accounts a ON g.stable_id=a.id WHERE g.kind=? AND a.deleted_at IS NULL').bind('human').all<{ entity_key: string; display_name: string; nationality: string; public_profile: number }>()).results;
  for (const h of humans) ents.set(h.entity_key, { key: h.entity_key, name: h.public_profile ? h.display_name : '비공개 선수', nationality: h.nationality, kind: 'human' });
  const subs = (await env.DB.prepare('SELECT participant_id, instance_id, season, event_id, world_day, place, entries, field, paid, prize, cost, rules_version FROM ranked_submissions').all<{ participant_id: string; instance_id: string; season: number; event_id: string; world_day: number; place: number; entries: number; field: number; paid: number; prize: number; cost: number; rules_version: string }>()).results;
  const hr: HumanResult[] = subs.map((s) => ({ humanId: s.participant_id.replace(/^human:/, ''), instanceId: s.instance_id, season: s.season, eventId: s.event_id, day: s.world_day, place: s.place, entries: s.entries, field: s.field, paid: s.paid, prize: s.prize, cost: s.cost, rulesVersion: s.rules_version }));
  const humanPoints = buildPointRows({ ...SNAP, events: [] }, ents, SNAP.roster, hr);
  const merged = new Map(basePoints);
  for (const [k, v] of humanPoints) merged.set(k, v);
  return { ents, points: merged };
}

// ───────── 입장/정산 정의 ─────────
interface EntryDef {
  source: 'catalog' | 'world'; defId: string; season?: number; name: string; buyIn: number; fee: number; kind: 'tournament' | 'freeroll'; ranked: boolean;
  cap: number; baseField: number;
  def?: TournamentDef; ev?: EventDef;
}
function resolveEntry(source: string, id: string, season?: number): EntryDef {
  if (source === 'catalog') {
    const t = TOURNAMENTS.find((x) => x.id === id);
    if (!t) throw new HttpError(404, '알 수 없는 대회');
    return { source: 'catalog', defId: t.id, name: t.name, buyIn: t.buyIn, fee: t.fee, kind: t.group === 'free' ? 'freeroll' : 'tournament', ranked: false, cap: t.kind === 'mtt' ? t.entrants * 4 : t.entrants, baseField: t.entrants, def: t };
  }
  if (source === 'world') {
    const ev = TEMPLATE.get(id);
    if (!ev) throw new HttpError(404, '알 수 없는 이벤트');
    const s = season ?? CURRENT_SEASON;
    if (s !== CURRENT_SEASON) throw new HttpError(400, '현재 시즌 이벤트만 참가할 수 있습니다');
    const field = Math.max(8, Math.round(ev.field * (SEASON_GROWTH[s] ?? 1)));
    return { source: 'world', defId: ev.id, season: s, name: ev.name, buyIn: ev.buyIn, fee: Math.round(ev.buyIn * ev.feePct), kind: 'tournament', ranked: isRankedEvent(ev), cap: Math.min(field * 3, 40000), baseField: field, ev };
  }
  throw new HttpError(400, '알 수 없는 대회 종류');
}
function prizeOf(e: EntryDef, totalEntries: number, place: number, targetBuyIn = 0): number {
  if (e.def) {
    if (e.def.kind === 'mtt') return payoutStructure(totalEntries, e.def.buyIn)[place - 1] ?? 0;
    return sngPrizeTable(e.def)[place - 1] ?? 0;
  }
  return prizeAtPlace(e.ev!, totalEntries, place, targetBuyIn);
}
const paidOf = (e: EntryDef, totalEntries: number): number => {
  if (e.def) return e.def.kind === 'mtt' ? payoutStructure(totalEntries, e.def.buyIn).length : e.def.entrants <= 2 ? 1 : e.def.entrants <= 6 ? 2 : 3;
  const ps = prizeStructure(e.ev!, totalEntries, e.ev!.satelliteFor ? TEMPLATE.get(e.ev!.satelliteFor)!.buyIn : 0);
  if (e.ev!.kind === 'hu') return Math.max(2, Math.min(8, totalEntries / 2));
  return ps.paid;
};

// ───────── 본문 파서 ─────────
async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'JSON 요청만 허용됩니다');
  try { return (await req.json()) as T; } catch { throw new HttpError(400, '잘못된 JSON'); }
}
const str = (v: unknown, name: string, max = 200): string => { if (typeof v !== 'string' || !v.length || v.length > max) throw new HttpError(400, `${name} 값이 올바르지 않습니다`); return v; };
const int = (v: unknown, name: string, min = 0, max = 1e12): number => { if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new HttpError(400, `${name} 값이 올바르지 않습니다`); return v; };

// ───────── 핸들러 ─────────
export async function handle(req: Request, env: Env): Promise<Response> {
  const now = env.now ? env.now() : Date.now();
  const url = new URL(req.url);
  const path = url.pathname;
  try {
    if (!path.startsWith('/api/')) return json({ error: 'not found' }, 404);
    await migrate(env.DB);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // CSRF 완화: 사용자 정의 헤더 필수(교차 출처 폼으로는 보낼 수 없다) + Origin 일치
      if (req.headers.get('x-requested-with') !== 'poker-arena') throw new HttpError(403, '허용되지 않은 요청', 'csrf');
      const origin = req.headers.get('origin');
      if (origin && new URL(origin).host !== url.host) throw new HttpError(403, '출처가 다릅니다', 'csrf');
    }
    const key = `${req.method} ${path}`;

    if (key === 'GET /api/health') return json({ ok: true, time: now, worldDay: worldDay(now), rules: RULES_VERSION });
    if (key === 'POST /api/register') return await register(req, env, now);
    if (key === 'POST /api/login') return await login(req, env, now);
    if (key === 'POST /api/logout') return await logout(req, env);
    if (key === 'GET /api/ranking') return await rankingHandler(req, env, now, url);
    if (key === 'GET /api/news') return await newsHandler(env);
    if (key === 'GET /api/rules') return json({ version: RULES_VERSION, text: describeRules() });
    if (key === 'GET /api/world') return json({ day: worldDay(now), season: CURRENT_SEASON, anchorDay: WORLD_ANCHOR_DAY, snapshotEvents: SNAP.events.length, snapshotSha: 'see data/season.sha256', note: '사전 계산된 공식 AI 세계 스냅샷을 날짜에 맞춰 공개합니다 (실시간 연산 아님)' });

    const me = await requireAuth(req, env, now);
    if (key === 'GET /api/me') return json(await meView(env, me));
    if (key === 'GET /api/state') return json(await stateView(env, me, now));
    if (key === 'POST /api/wallet/daily') return await dailyHandler(env, me, now);
    if (key === 'POST /api/cash/open') return await cashOpen(req, env, me, now);
    if (key === 'POST /api/cash/topup') return await cashTopup(req, env, me, now);
    if (key === 'POST /api/cash/close') return await cashClose(req, env, me, now);
    if (key === 'POST /api/entry') return await entryOpen(req, env, me, now);
    if (key === 'POST /api/entry/reenter') return await entryReenter(req, env, me, now);
    if (key === 'POST /api/entry/settle') return await entrySettle(req, env, me, now);
    if (key === 'POST /api/entry/abandon') return await entryAbandon(req, env, me, now);
    if (key === 'GET /api/ranking/me') return await rankingMe(env, me, now, url);
    if (key === 'POST /api/groups') return await groupCreate(req, env, me, now);
    if (key === 'POST /api/groups/join') return await groupJoin(req, env, me, now);
    if (key === 'GET /api/groups') return json(await groupsOf(env, me));
    if (key === 'POST /api/profile') return await profileUpdate(req, env, me, now);
    if (key === 'GET /api/save') return await saveGet(env, me, url);
    if (key === 'PUT /api/save') return await savePut(req, env, me, now);
    if (key === 'POST /api/account/delete') return await accountDelete(req, env, me, now);
    return json({ error: '존재하지 않는 API' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
    if (e instanceof W.InsufficientFunds || e instanceof W.WalletError) return json({ error: (e as Error).message, code: 'wallet' }, 409);
    if (e instanceof RecoveryRequired) return json({ error: (e as Error).message, code: 'RECONCILIATION_REQUIRED' }, 423);
    console.error('API error', e);
    return json({ error: '서버 오류', code: 'internal' }, 500);
  }
}

// ───────── 가입/로그인 ─────────
async function register(req: Request, env: Env, now: number) {
  const b = await body<{ username?: unknown; password?: unknown; displayName?: unknown; nationality?: unknown; publicProfile?: unknown }>(req);
  const username = str(b.username, '아이디', 20);
  if (!USERNAME_RE.test(username)) throw new HttpError(400, '아이디는 2~20자의 한글·영문·숫자·밑줄만 가능합니다');
  const password = str(b.password, '비밀번호', 200);
  if (password.length < 8) throw new HttpError(400, '비밀번호는 8자 이상이어야 합니다');
  if (password.toLowerCase() === username.toLowerCase()) throw new HttpError(400, '비밀번호는 아이디와 달라야 합니다');
  const displayName = typeof b.displayName === 'string' && b.displayName.trim() ? b.displayName.trim().slice(0, 20) : username;
  const nationality = typeof b.nationality === 'string' && b.nationality.length <= 20 ? b.nationality : '대한민국';
  const pub = b.publicProfile === false ? 0 : 1;
  const exists = await env.DB.prepare('SELECT 1 AS x FROM accounts WHERE username=?').bind(username).first();
  if (exists) throw new HttpError(409, '이미 사용 중인 아이디입니다', 'username_taken');
  const id = randomId();
  const salt = randomB64(16);
  const iters = env.iterations ?? PBKDF2_ITERATIONS;
  const hash = await hashPassword(password, salt, iters);
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO accounts(id, username, display_name, password_hash, salt, iterations, nationality, public_profile, created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, username, displayName, hash, salt, iters, nationality, pub, now),
      env.DB.prepare('INSERT INTO global_roster(entity_key, kind, stable_id, display_name, nationality, created_at) VALUES (?,?,?,?,?,?)').bind(`human:${id}`, 'human', id, displayName, nationality, now),
    ]);
  } catch { throw new HttpError(409, '이미 사용 중인 아이디입니다', 'username_taken'); }
  await createWallet(env.DB, id, now);
  await audit(env, now, id, 'register');
  return startSession(req, env, id, now, { id, username, displayName, nationality });
}
async function startSession(req: Request, env: Env, accountId: string, now: number, payload: unknown) {
  const token = randomB64(32);
  await env.DB.prepare('INSERT INTO sessions(token_hash, account_id, created_at, expires_at) VALUES (?,?,?,?)').bind(await sha256Hex(token), accountId, now, now + SESSION_DAYS * 86400_000).run();
  return json({ ok: true, user: payload }, 200, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400, isSecure(req)) });
}
async function login(req: Request, env: Env, now: number) {
  const b = await body<{ username?: unknown; password?: unknown }>(req);
  const username = str(b.username, '아이디', 20); const password = str(b.password, '비밀번호', 200);
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'local';
  const k = `${username.toLowerCase()}|${ip}`;
  const att = await env.DB.prepare('SELECT count, window_start FROM login_attempts WHERE key=?').bind(k).first<{ count: number; window_start: number }>();
  if (att && now - att.window_start < 15 * 60_000 && att.count >= 8) throw new HttpError(429, '로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요', 'rate_limited');
  const acc = await env.DB.prepare('SELECT id, username, display_name, nationality, password_hash, salt, iterations FROM accounts WHERE username=? AND deleted_at IS NULL').bind(username).first<{ id: string; username: string; display_name: string; nationality: string; password_hash: string; salt: string; iterations: number }>();
  // 계정이 없어도 같은 비용의 해시를 계산해 타이밍으로 계정 존재 여부를 알 수 없게 한다
  const calc = await hashPassword(password, acc?.salt ?? 'AAAAAAAAAAAAAAAAAAAAAA==', acc?.iterations ?? PBKDF2_ITERATIONS);
  if (!acc || !safeEqual(calc, acc.password_hash)) {
    const fresh = !att || now - att.window_start >= 15 * 60_000;
    await env.DB.prepare('INSERT INTO login_attempts(key, count, window_start) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=?, window_start=?').bind(k, fresh ? 1 : att!.count + 1, fresh ? now : att!.window_start, fresh ? 1 : att!.count + 1, fresh ? now : att!.window_start).run();
    throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다', 'bad_credentials');
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE key=?').bind(k).run();
  return startSession(req, env, acc.id, now, { id: acc.id, username: acc.username, displayName: acc.display_name, nationality: acc.nationality });
}
async function logout(req: Request, env: Env) {
  const tok = (await parseCookies(req))[COOKIE];
  if (tok) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256Hex(tok)).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0, isSecure(req)) });
}

/** 서버 지갑 + 티켓 → 클라이언트가 쓰는 Wallet 형태 */
async function wOut(env: Env, me: Account, w: W.Wallet): Promise<W.Wallet> {
  const rows = (await env.DB.prepare('SELECT id, event_id, season, value, source_entry, status, used_entry, created_at FROM tickets WHERE account_id=?').bind(me.id).all<{ id: string; event_id: string; season: number; value: number; source_entry: string; status: 'active' | 'used'; used_entry: string | null; created_at: number }>()).results;
  return { ...w, tickets: rows.map((t) => ({ id: t.id, eventId: t.event_id, season: t.season, value: t.value, sourceEntry: t.source_entry, status: t.status, usedEntry: t.used_entry ?? undefined, createdAt: t.created_at })) };
}

// ───────── 상태 ─────────
async function meView(env: Env, me: Account) {
  return { id: me.id, username: me.username, displayName: me.display_name, nationality: me.nationality, publicProfile: !!me.public_profile, entityKey: `human:${me.id}` };
}
async function stateView(env: Env, me: Account, now: number) {
  const w = await loadWallet(env.DB, me.id);
  const tickets = (await env.DB.prepare('SELECT id, event_id, season, value, status, created_at FROM tickets WHERE account_id=? AND status=?').bind(me.id, 'active').all()).results;
  const open = (await env.DB.prepare('SELECT sid, source, def_id, season, instance_id, seed, status FROM tournament_entries WHERE account_id=? AND status=?').bind(me.id, 'open').all()).results;
  const save = await env.DB.prepare('SELECT slot, version, bytes, updated_at FROM saves WHERE account_id=?').bind(me.id).all();
  return { me: await meView(env, me), wallet: w ? await wOut(env, me, w.wallet) : null, walletErrors: w ? W.verifyWallet(w.wallet) : ['지갑 없음'], tickets, openEntries: open, saves: save.results, worldDay: worldDay(now), season: CURRENT_SEASON, serverTime: now };
}
async function dailyHandler(env: Env, me: Account, now: number) {
  let granted = 0; let reason: string | undefined;
  const wallet = await mutateWallet(env.DB, me.id, (w) => { const r = W.dailyGrant(w, now); granted = r.granted; reason = r.reason; return r.wallet; });
  return json({ ok: true, granted, reason, wallet: await wOut(env, me, wallet) });
}

// ───────── 캐시게임 ─────────
async function assertNoOpen(env: Env, me: Account, exceptSid?: string) {
  const w = await loadWallet(env.DB, me.id);
  for (const a of Object.values(w!.wallet.accounts)) if (a.status === 'open' && a.kind !== 'practice' && a.id !== exceptSid) throw new HttpError(409, '진행 중인 경기가 있습니다. 먼저 마치거나 포기하세요', 'open_exists');
}
async function cashOpen(req: Request, env: Env, me: Account, now: number) {
  const b = await body(req);
  const sid = str(b.sid, 'sid', 80); const tableId = str(b.tableId, 'tableId', 20); const buyIn = int(b.buyIn, 'buyIn', 1);
  const t = CASH_TABLES.find((x) => x.id === tableId); if (!t) throw new HttpError(404, '알 수 없는 테이블');
  const wl = await loadWallet(env.DB, me.id);
  if (!wl!.wallet.accounts[sid]) await assertNoOpen(env, me);
  const wallet = await mutateWallet(env.DB, me.id, (w) => W.openCash(w, sid, t.name, buyIn, { min: t.minBuy, max: t.maxBuy }, now));
  return json({ ok: true, wallet: await wOut(env, me, wallet) });
}
async function cashTopup(req: Request, env: Env, me: Account, now: number) {
  const b = await body(req);
  const sid = str(b.sid, 'sid', 80); const opId = str(b.opId, 'opId', 60); const amount = int(b.amount, 'amount', 1); const chips = int(b.currentChips, 'currentChips', 0);
  const wl = await loadWallet(env.DB, me.id); const acct = wl!.wallet.accounts[sid];
  if (!acct || acct.kind !== 'cash') throw new HttpError(404, '캐시 계정이 없습니다');
  const t = CASH_TABLES.find((x) => x.name === acct.label)!;
  const wallet = await mutateWallet(env.DB, me.id, (w) => W.cashTopUp(w, sid, opId, amount, { max: t.maxBuy, currentChips: chips }, now));
  return json({ ok: true, wallet: await wOut(env, me, wallet) });
}
async function cashClose(req: Request, env: Env, me: Account, now: number) {
  const b = await body(req);
  const sid = str(b.sid, 'sid', 80); const chips = int(b.chips, 'chips', 0);
  const wl = await loadWallet(env.DB, me.id); const acct = wl!.wallet.accounts[sid];
  if (!acct || acct.kind !== 'cash') throw new HttpError(404, '캐시 계정이 없습니다');
  // 합리성 상한: 테이블에 넣은 총액의 25배(캐시게임은 순위 점수와 무관, 자금 사고 방지용)
  if (chips > acct.spent * 25) throw new HttpError(400, '정산 칩 수가 허용 범위를 넘었습니다');
  const wallet = await mutateWallet(env.DB, me.id, (w) => W.closeCash(w, sid, chips, now));
  return json({ ok: true, wallet: await wOut(env, me, wallet) });
}

// ───────── 토너먼트 ─────────
async function entryOpen(req: Request, env: Env, me: Account, now: number) {
  const b = await body(req);
  const sid = str(b.sid, 'sid', 80); const e = resolveEntry(str(b.source, 'source', 20), str(b.defId, 'defId', 60), typeof b.season === 'number' ? b.season : undefined);
  const useTicket = b.useTicket === true;
  const existing = await env.DB.prepare('SELECT sid, account_id, instance_id, seed, status FROM tournament_entries WHERE sid=?').bind(sid).first<{ sid: string; account_id: string; instance_id: string; seed: number; status: string }>();
  if (existing) { // 같은 sid 재요청: 같은 결과(멱등)
    if (existing.account_id !== me.id) throw new HttpError(403, '권한이 없습니다');
    const w0 = await loadWallet(env.DB, me.id);
    return json({ ok: true, wallet: await wOut(env, me, w0!.wallet), instanceId: existing.instance_id, seed: existing.seed, replay: true });
  }
  await assertNoOpen(env, me);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const instanceId = `inst:${randomId()}`;
  let ticketId: string | null = null;
  if (useTicket) {
    if (e.source !== 'world') throw new HttpError(400, '티켓은 월드 이벤트에서만 사용할 수 있습니다');
    const t = await env.DB.prepare('SELECT id FROM tickets WHERE account_id=? AND event_id=? AND season=? AND status=? ORDER BY created_at LIMIT 1').bind(me.id, e.defId, e.season ?? CURRENT_SEASON, 'active').first<{ id: string }>();
    if (!t) throw new HttpError(409, '사용 가능한 티켓이 없습니다', 'no_ticket');
    ticketId = t.id;
  }
  const cost = ticketId ? 0 : e.buyIn + e.fee;
  const wallet = await mutateWallet(env.DB, me.id,
    (w) => W.enterTournament(w, sid, { id: `${e.source}:${e.defId}`, name: e.name, buyIn: e.buyIn, fee: e.fee }, e.kind, now, !!ticketId),
    (g) => {
      const stmts: Stmt[] = [env.DB.prepare(`INSERT INTO tournament_entries(sid, account_id, source, def_id, season, instance_id, seed, cost, entries, status, created_at, world_day, ticket_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${g.sql}`).bind(sid, me.id, e.source, e.defId, e.season ?? null, instanceId, seed, cost, 1, 'open', now, worldDay(now), ticketId, ...g.binds)];
      if (ticketId) stmts.push(env.DB.prepare(`UPDATE tickets SET status='used', used_entry=? WHERE id=? AND status='active' AND ${g.sql}`).bind(sid, ticketId, ...g.binds));
      return stmts;
    });
  return json({ ok: true, wallet: await wOut(env, me, wallet), instanceId, seed, cost, ranked: e.ranked, baseField: e.baseField });
}
async function entryReenter(req: Request, env: Env, me: Account, now: number) {
  const b = await body(req); const sid = str(b.sid, 'sid', 80);
  const ent = await env.DB.prepare('SELECT * FROM tournament_entries WHERE sid=? AND account_id=?').bind(sid, me.id).first<{ source: string; def_id: string; season: number | null; status: string; entries: number }>();
  if (!ent || ent.status !== 'open') throw new HttpError(404, '진행 중인 대회가 없습니다');
  const e = resolveEntry(ent.source, ent.def_id, ent.season ?? undefined);
  const allowed = e.def ? !!e.def.reentry : !!e.ev!.reentry;
  const max = e.def ? 2 : (e.ev!.reentry?.max ?? 0);
  if (!allowed || ent.entries - 1 >= max) throw new HttpError(409, '재진입할 수 없습니다');
  const entryNo = ent.entries + 1;
  const wallet = await mutateWallet(env.DB, me.id, (w) => W.reenterTournament(w, sid, { id: `${e.source}:${e.defId}`, name: e.name, buyIn: e.buyIn, fee: e.fee }, entryNo, now),
    (g) => [env.DB.prepare(`UPDATE tournament_entries SET entries=?, cost=cost+? WHERE sid=? AND entries=? AND ${g.sql}`).bind(entryNo, e.buyIn + e.fee, sid, ent.entries, ...g.binds)]);
  return json({ ok: true, wallet: await wOut(env, me, wallet) });
}
async function entryAbandon(req: Request, env: Env, me: Account, now: number) {
  const b = await body(req); const sid = str(b.sid, 'sid', 80);
  const wallet = await mutateWallet(env.DB, me.id, (w) => W.forfeit(w, sid, now),
    (g) => [env.DB.prepare(`UPDATE tournament_entries SET status='forfeit', settled_at=? WHERE sid=? AND account_id=? AND status='open' AND ${g.sql}`).bind(now, sid, me.id, ...g.binds)]);
  return json({ ok: true, wallet: await wOut(env, me, wallet) });
}

async function entrySettle(req: Request, env: Env, me: Account, now: number) {
  const b = await body(req);
  const sid = str(b.sid, 'sid', 80);
  const place = int(b.place, 'place', 1, 100000); const field = int(b.totalEntries, 'totalEntries', 2, 100000);
  const hands = int(b.hands ?? 0, 'hands', 0, 1e7); const bountyClaim = int(b.bounty ?? 0, 'bounty', 0, 1e12); const digest = typeof b.digest === 'string' ? b.digest.slice(0, 128) : '';
  const ent = await env.DB.prepare('SELECT * FROM tournament_entries WHERE sid=? AND account_id=?').bind(sid, me.id).first<{ sid: string; source: string; def_id: string; season: number | null; instance_id: string; status: string; entries: number; cost: number; world_day: number | null; place: number | null; prize: number | null; field: number | null }>();
  if (!ent) throw new HttpError(404, '등록된 대회가 없습니다');
  if (ent.status === 'settled') { // 멱등: 이미 정산됨 → 저장된 결과 그대로
    const w0 = await loadWallet(env.DB, me.id);
    return json({ ok: true, replay: true, wallet: await wOut(env, me, w0!.wallet), result: { place: ent.place, prize: ent.prize, field: ent.field } });
  }
  if (ent.status !== 'open') throw new HttpError(409, '이미 종료된 대회입니다');
  const e = resolveEntry(ent.source, ent.def_id, ent.season ?? undefined);
  if (field > e.cap || field < Math.min(e.baseField, 2)) throw new HttpError(400, '참가자 수가 허용 범위를 벗어났습니다');
  if (place > field) throw new HttpError(400, '순위가 참가자 수를 넘었습니다');
  const minHands = e.ev ? (e.ev.kind === 'hu' ? 2 : 3) : 2;
  if (hands < minHands && place === 1 && field > 8) throw new HttpError(400, '핸드 수가 너무 적습니다');
  const targetBuyIn = e.ev?.satelliteFor ? TEMPLATE.get(e.ev.satelliteFor)!.buyIn : 0;
  const prize = prizeOf(e, field, place, targetBuyIn);
  let bounty = 0;
  if (bountyClaim > 0) {
    if (!e.ev?.pko) throw new HttpError(400, '바운티가 없는 대회입니다');
    const unit = Math.round(e.ev.buyIn * e.ev.pko.share);
    if (bountyClaim > unit * field * 1.5) throw new HttpError(400, '바운티 금액이 허용 범위를 넘었습니다');
    bounty = bountyClaim;
  }
  let issued = 0;
  const paid = paidOf(e, field);
  if (e.ev?.kind === 'satellite') issued = place <= ticketsFor(e.ev, field, targetBuyIn) ? 1 : 0;
  const ranked = e.ranked && !!e.ev;
  const rid = `rr:${ent.instance_id}:${me.id}:${RULES_VERSION}`;
  const pts = ranked ? eventPoints(e.ev!, place, paid, field) : 0;
  const day = worldDay(now);
  const wallet = await mutateWallet(env.DB, me.id, (w) => W.payPrize(w, sid, prize, place, field, now, bounty), (g) => {
    const stmts: Stmt[] = [
      env.DB.prepare(`UPDATE tournament_entries SET status='settled', settled_at=?, place=?, field=?, prize=?, digest=? WHERE sid=? AND account_id=? AND status='open' AND ${g.sql}`).bind(now, place, field, prize, digest, sid, me.id, ...g.binds),
    ];
    if (ranked) {
      stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO ranked_submissions(instance_id, participant_id, rules_version, ranked_result_id, season, event_id, world_day, place, entries, field, paid, prize, cost, points, created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${g.sql}`).bind(ent.instance_id, `human:${me.id}`, RULES_VERSION, rid, ent.season ?? CURRENT_SEASON, e.defId, day, place, ent.entries, field, paid, prize + bounty, ent.cost, pts, now, ...g.binds));
      stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO points_ledger(ranked_result_id, participant_id, season, event_id, points, created_at) SELECT ?,?,?,?,?,? WHERE ${g.sql}`).bind(rid, `human:${me.id}`, ent.season ?? CURRENT_SEASON, e.defId, pts, now, ...g.binds));
      stmts.push(env.DB.prepare(`INSERT INTO meta(key, value) VALUES ('rank_version','1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1`));
    }
    if (issued) stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO tickets(id, account_id, event_id, season, value, source_entry, status, created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${g.sql}`).bind(`tk:${sid}`, me.id, e.ev!.satelliteFor!, CURRENT_SEASON, targetBuyIn, sid, 'active', now, ...g.binds));
    return stmts;
  });
  await audit(env, now, me.id, 'settle', `${sid} place=${place} prize=${prize} bounty=${bounty}`);
  const after = await env.DB.prepare('SELECT status, place, prize, field FROM tournament_entries WHERE sid=?').bind(sid).first<{ status: string; place: number; prize: number; field: number }>();
  return json({ ok: true, replay: false, wallet: await wOut(env, me, wallet), result: { place: after?.place ?? place, prize: after?.prize ?? prize, field }, ranked, points: pts, ticket: issued ? { eventId: e.ev!.satelliteFor, value: targetBuyIn } : null });
}

// ───────── 랭킹 ─────────
function parseQuery(url: URL, now: number): RankQuery {
  const g = (k: string) => url.searchParams.get(k) ?? undefined;
  const scope = (g('scope') as RankQuery['scope']) ?? 'season';
  const kinds = g('kinds')?.split(',').filter(Boolean) as RankQuery['kinds'];
  return {
    scope: ['season', 'long', 'all'].includes(scope) ? scope : 'season', season: g('season') ? Number(g('season')) : CURRENT_SEASON, cutoff: absDay(CURRENT_SEASON, worldDay(now)),
    kinds, nationality: g('nationality'), seriesId: g('series'), format: g('format') as RankQuery['format'], search: g('q'),
    offset: Math.max(0, Number(g('offset') ?? 0) || 0), limit: Math.min(200, Math.max(1, Number(g('limit') ?? 50) || 50)),
  };
}
async function rankingHandler(req: Request, env: Env, now: number, url: URL) {
  const q = parseQuery(url, now);
  const { ents, points } = await rankingData(env);
  const gid = url.searchParams.get('group');
  if (gid) {
    const me = await requireAuth(req, env, now);
    const mem = await env.DB.prepare('SELECT 1 AS x FROM friend_group_members WHERE group_id=? AND account_id=?').bind(gid, me.id).first();
    if (!mem) throw new HttpError(403, '그룹 구성원만 볼 수 있습니다');
    const members = (await env.DB.prepare('SELECT account_id FROM friend_group_members WHERE group_id=?').bind(gid).all<{ account_id: string }>()).results;
    q.groupKeys = members.map((m) => `human:${m.account_id}`);
  }
  const r = computeRanking(ents, points, q);
  const registered = ents.size;
  const humans = [...ents.values()].filter((e) => e.kind === 'human').length;
  return json({ ...r, registered, humans, ais: registered - humans, rules: RULES_VERSION, worldDay: worldDay(now), season: q.season, generatedFrom: '공식 AI 세계 스냅샷 + 서버 검증 개인 인스턴스 결과' });
}
async function rankingMe(env: Env, me: Account, now: number, url: URL) {
  const q = parseQuery(url, now); q.limit = 100000; q.offset = 0;
  const { ents, points } = await rankingData(env);
  const key = `human:${me.id}`;
  const view = async (qq: RankQuery) => {
    const all = computeRanking(ents, points, qq).rows;
    const i = all.findIndex((r) => r.key === key);
    return { rank: i >= 0 ? all[i].rank : 0, row: i >= 0 ? all[i] : null, of: all.filter((r) => !r.unranked).length, before: i > 0 ? all.slice(Math.max(0, i - 2), i) : [], after: i >= 0 ? all.slice(i + 1, i + 3) : [] };
  };
  const world = await view({ ...q });
  const kr = await view({ ...q, nationality: '대한민국' });
  const longTerm = await view({ ...q, scope: 'long' });
  return json({ key, world, kr, long: longTerm, rules: RULES_VERSION });
}

// ───────── 뉴스 (확정된 개인 인스턴스 결과만; 공식 AI 세계 기사와 분류가 다르다) ─────────
async function newsHandler(env: Env) {
  const rows = (await env.DB.prepare(`SELECT r.event_id, r.season, r.place, r.field, r.points, r.created_at, a.display_name, a.public_profile FROM ranked_submissions r JOIN accounts a ON r.participant_id = 'human:' || a.id WHERE a.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 20`).all<{ event_id: string; season: number; place: number; field: number; points: number; created_at: number; display_name: string; public_profile: number }>()).results;
  return json({ items: rows.filter((r) => r.public_profile).map((r) => ({ kind: 'private-instance', name: r.display_name, eventId: r.event_id, eventName: TEMPLATE.get(r.event_id)?.name ?? r.event_id, season: r.season, place: r.place, field: r.field, points: r.points, at: r.created_at })) });
}

// ───────── 친구·가족 그룹 ─────────
async function groupCreate(req: Request, env: Env, me: Account, now: number) {
  const b = await body(req); const name = str(b.name, '그룹 이름', 30);
  const id = randomId(); const code = randomB64(6).replace(/[^A-Za-z0-9]/g, 'x').slice(0, 8).toUpperCase();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO friend_groups(id, name, code, owner_id, created_at) VALUES (?,?,?,?,?)').bind(id, name, code, me.id, now),
    env.DB.prepare('INSERT INTO friend_group_members(group_id, account_id, joined_at) VALUES (?,?,?)').bind(id, me.id, now),
  ]);
  return json({ ok: true, id, code, name });
}
async function groupJoin(req: Request, env: Env, me: Account, now: number) {
  const b = await body(req); const code = str(b.code, '초대 코드', 20).toUpperCase();
  const g = await env.DB.prepare('SELECT id, name FROM friend_groups WHERE code=?').bind(code).first<{ id: string; name: string }>();
  if (!g) throw new HttpError(404, '초대 코드를 찾을 수 없습니다');
  await env.DB.prepare('INSERT OR IGNORE INTO friend_group_members(group_id, account_id, joined_at) VALUES (?,?,?)').bind(g.id, me.id, now).run();
  return json({ ok: true, id: g.id, name: g.name });
}
async function groupsOf(env: Env, me: Account) {
  const gs = (await env.DB.prepare('SELECT g.id, g.name, g.code, g.owner_id FROM friend_groups g JOIN friend_group_members m ON m.group_id=g.id WHERE m.account_id=?').bind(me.id).all<{ id: string; name: string; code: string; owner_id: string }>()).results;
  const out = [];
  for (const g of gs) {
    const members = (await env.DB.prepare('SELECT a.display_name AS name, a.public_profile AS pub FROM friend_group_members m JOIN accounts a ON a.id=m.account_id WHERE m.group_id=?').bind(g.id).all<{ name: string; pub: number }>()).results;
    out.push({ id: g.id, name: g.name, code: g.owner_id === me.id ? g.code : undefined, members: members.map((m) => m.name) });
  }
  return { groups: out };
}
async function profileUpdate(req: Request, env: Env, me: Account, now: number) {
  const b = await body(req);
  const display = typeof b.displayName === 'string' && b.displayName.trim() ? b.displayName.trim().slice(0, 20) : me.display_name;
  const nat = typeof b.nationality === 'string' && b.nationality.length <= 20 ? b.nationality : me.nationality;
  const pub = b.publicProfile === false ? 0 : b.publicProfile === true ? 1 : me.public_profile;
  await env.DB.batch([
    env.DB.prepare('UPDATE accounts SET display_name=?, nationality=?, public_profile=? WHERE id=?').bind(display, nat, pub, me.id),
    env.DB.prepare('UPDATE global_roster SET display_name=?, nationality=? WHERE entity_key=?').bind(display, nat, `human:${me.id}`),
  ]);
  await audit(env, now, me.id, 'profile');
  return json({ ok: true });
}
async function accountDelete(req: Request, env: Env, me: Account, now: number) {
  const b = await body(req);
  const acc = await env.DB.prepare('SELECT password_hash, salt, iterations FROM accounts WHERE id=?').bind(me.id).first<{ password_hash: string; salt: string; iterations: number }>();
  if (!acc || !safeEqual(await hashPassword(str(b.password, '비밀번호', 200), acc.salt, acc.iterations), acc.password_hash)) throw new HttpError(401, '비밀번호가 올바르지 않습니다');
  await env.DB.batch([
    env.DB.prepare('UPDATE accounts SET deleted_at=? WHERE id=?').bind(now, me.id),
    env.DB.prepare('DELETE FROM sessions WHERE account_id=?').bind(me.id),
    env.DB.prepare('DELETE FROM global_roster WHERE entity_key=?').bind(`human:${me.id}`),
    env.DB.prepare('DELETE FROM friend_group_members WHERE account_id=?').bind(me.id),
    env.DB.prepare('DELETE FROM save_chunks WHERE account_id=?').bind(me.id),
    env.DB.prepare('DELETE FROM saves WHERE account_id=?').bind(me.id),
  ]);
  await audit(env, now, me.id, 'delete');
  return json({ ok: true });
}

// ───────── 클라우드 저장 (기기 간 이어하기) ─────────
const CHUNK = 400_000;
async function saveGet(env: Env, me: Account, url: URL) {
  const slot = url.searchParams.get('slot') ?? 'main';
  const meta = await env.DB.prepare('SELECT version, chunks, bytes, updated_at FROM saves WHERE account_id=? AND slot=?').bind(me.id, slot).first<{ version: number; chunks: number; bytes: number; updated_at: number }>();
  if (!meta) return json({ ok: true, version: 0, data: null });
  const rows = (await env.DB.prepare('SELECT data FROM save_chunks WHERE account_id=? AND slot=? ORDER BY idx').bind(me.id, slot).all<{ data: string }>()).results;
  return json({ ok: true, version: meta.version, data: rows.map((r) => r.data).join(''), updatedAt: meta.updated_at });
}
async function savePut(req: Request, env: Env, me: Account, now: number) {
  const b = await body<{ slot?: unknown; version?: unknown; data?: unknown }>(req);
  const slot = typeof b.slot === 'string' ? b.slot.slice(0, 20) : 'main';
  const expected = int(b.version, 'version', 0); const data = str(b.data, 'data', 8_000_000);
  const cur = await env.DB.prepare('SELECT version FROM saves WHERE account_id=? AND slot=?').bind(me.id, slot).first<{ version: number }>();
  if ((cur?.version ?? 0) !== expected) throw new HttpError(409, '다른 기기에서 더 최근에 저장되었습니다', 'version_conflict');
  const chunks: string[] = []; for (let i = 0; i < data.length; i += CHUNK) chunks.push(data.slice(i, i + CHUNK));
  const next = expected + 1; const op = randomId();
  const upd = cur
    ? env.DB.prepare('UPDATE saves SET version=?, chunks=?, bytes=?, updated_at=?, op=? WHERE account_id=? AND slot=? AND version=?').bind(next, chunks.length, data.length, now, op, me.id, slot, expected)
    : env.DB.prepare('INSERT OR IGNORE INTO saves(account_id, slot, version, chunks, bytes, updated_at, op) VALUES (?,?,?,?,?,?,?)').bind(me.id, slot, next, chunks.length, data.length, now, op);
  const g = 'EXISTS(SELECT 1 FROM saves WHERE account_id=? AND slot=? AND op=?)';
  await env.DB.batch([
    upd,
    env.DB.prepare(`DELETE FROM save_chunks WHERE account_id=? AND slot=? AND ${g}`).bind(me.id, slot, me.id, slot, op),
    ...chunks.map((c, i) => env.DB.prepare(`INSERT INTO save_chunks(account_id, slot, idx, data) SELECT ?,?,?,? WHERE ${g}`).bind(me.id, slot, i, c, me.id, slot, op)),
    env.DB.prepare(`UPDATE accounts SET last_saved_at=? WHERE id=? AND ${g}`).bind(now, me.id, me.id, slot, op),
  ]);
  const won = await env.DB.prepare('SELECT op FROM saves WHERE account_id=? AND slot=?').bind(me.id, slot).first<{ op: string }>();
  if (won?.op !== op) throw new HttpError(409, '다른 기기에서 더 최근에 저장되었습니다', 'version_conflict');
  return json({ ok: true, version: next, savedAt: now });
}

export { ALL_RANKED };
