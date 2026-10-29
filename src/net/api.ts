/** 서버 API 호출 래퍼. 네트워크 실패는 status 0 으로 돌려준다(로컬 모드 폴백 판단용). */
export interface ApiResult<T = any> { ok: boolean; status: number; data: T }

export async function api<T = any>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, timeoutMs = 15000): Promise<ApiResult<T>> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method, signal: ctl.signal, credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'poker-arena' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return { ok: false, status: 0, data: { error: '서버에 연결할 수 없습니다 (API 응답이 아님)' } as T };
    return { ok: res.ok, status: res.status, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, data: { error: '서버에 연결할 수 없습니다' } as T };
  } finally { clearTimeout(t); }
}
