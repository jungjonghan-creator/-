/**
 * 서버 확정 지갑 연산. 온라인 모드에서 클라이언트는 아래 호출의 응답(서버가 확정한 지갑)만 화면에 반영한다.
 * 실패하면 예외를 던지고 지갑은 바뀌지 않는다.
 */
import type { Wallet } from '../economy/wallet';
import { api } from './api';

export class RemoteError extends Error { constructor(msg: string, public status: number, public code?: string) { super(msg); } }

async function call<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const r = await api<T & { error?: string; code?: string }>(method, path, body);
  if (!r.ok) throw new RemoteError((r.data as { error?: string }).error ?? `요청 실패 (${r.status})`, r.status, (r.data as { code?: string }).code);
  return r.data as T;
}
export const remote = {
  state: () => call<{ me: any; wallet: Wallet; walletErrors: string[]; tickets: any[]; openEntries: { sid: string; source: string; def_id: string; seed: number; instance_id: string }[]; worldDay: number; season: number }>('GET', '/api/state'),
  daily: () => call<{ granted: number; reason?: string; wallet: Wallet }>('POST', '/api/wallet/daily'),
  cashOpen: (sid: string, tableId: string, buyIn: number) => call<{ wallet: Wallet }>('POST', '/api/cash/open', { sid, tableId, buyIn }),
  cashTopup: (sid: string, opId: string, amount: number, currentChips: number) => call<{ wallet: Wallet }>('POST', '/api/cash/topup', { sid, opId, amount, currentChips }),
  cashClose: (sid: string, chips: number) => call<{ wallet: Wallet }>('POST', '/api/cash/close', { sid, chips }),
  entry: (sid: string, source: 'catalog' | 'world', defId: string, useTicket = false) => call<{ wallet: Wallet; instanceId: string; seed: number; ranked?: boolean }>('POST', '/api/entry', { sid, source, defId, season: source === 'world' ? 2035 : undefined, useTicket }),
  reenter: (sid: string) => call<{ wallet: Wallet }>('POST', '/api/entry/reenter', { sid }),
  settle: (p: { sid: string; place: number; totalEntries: number; hands: number; bounty?: number; digest?: string }) => call<{ wallet: Wallet; result: { place: number; prize: number; field: number }; ranked?: boolean; points?: number; ticket?: { eventId: string; value: number } | null }>('POST', '/api/entry/settle', p),
  abandon: (sid: string) => call<{ wallet: Wallet }>('POST', '/api/entry/abandon', { sid }),
  saveGet: () => call<{ version: number; data: string | null; updatedAt?: number }>('GET', '/api/save?slot=main'),
  savePut: (version: number, data: string) => call<{ version: number }>('PUT', '/api/save', { slot: 'main', version, data }),
};

// ───────── 클라우드 저장 직렬화 (gzip + base64) ─────────
export async function pack(obj: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const gz = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  let s = ''; const u = new Uint8Array(gz); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export async function unpack<T = unknown>(b64: string): Promise<T> {
  const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const txt = await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(txt) as T;
}
