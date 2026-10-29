/** Cloudflare Worker 진입점: /api/* 는 핸들러, 나머지는 정적 자산(dist). D1 바인딩 이름은 DB. */
import { handle } from './api';
import type { Db } from './db';

interface Env { DB: Db; ASSETS: { fetch(req: Request): Promise<Response> } }
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return handle(req, { DB: env.DB });
    return env.ASSETS.fetch(req);
  },
};
