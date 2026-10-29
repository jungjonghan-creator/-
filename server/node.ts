/** 로컬/자가 호스팅 서버: `npm run serve` → API + 빌드된 정적 파일(dist) 을 한 출처로 제공. DB 는 data/poker.sqlite (node:sqlite). */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { handle } from './api';
import { openNodeDb } from './nodeDb';

const PORT = Number(process.env.PORT ?? 8787);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const DIST = join(process.cwd(), 'dist');
await mkdir('data', { recursive: true });
const db = openNodeDb(process.env.DB_PATH ?? 'data/poker.sqlite');
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  try {
    // 터널(cloudflared 등) 뒤에서는 TRUST_PROXY=1 로 공개 주소(프로토콜·호스트)를 따른다 → Origin 검사·Secure 쿠키가 올바르게 동작
    const fwdHost = TRUST_PROXY ? (req.headers['x-forwarded-host'] as string | undefined) : undefined;
    const fwdProto = TRUST_PROXY ? (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] : undefined;
    const url = new URL(req.url ?? '/', `${fwdProto ?? 'http'}://${fwdHost ?? req.headers.host ?? 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const r = await handle(new Request(url, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }), { DB: db });
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    let p = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    let file = join(DIST, p);
    let data: Buffer;
    try { data = await readFile(file); } catch { file = join(DIST, 'index.html'); data = await readFile(file); }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }); res.end(data);
  } catch (e) { console.error(e); res.writeHead(500); res.end('server error'); }
}).listen(PORT, '0.0.0.0', () => console.log(`POKER ARENA 서버: http://localhost:${PORT}  (DB: ${process.env.DB_PATH ?? 'data/poker.sqlite'})`));
