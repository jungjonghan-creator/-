/** 초대 링크(?join=CODE): 링크로 들어온 사람이 가입·로그인한 뒤 자동으로 친구 그룹에 참여한다. */
const KEY = 'pa_join';
const read = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v: string | null) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* 저장 불가 환경 */ } };

export const inviteUrl = (code: string, origin = typeof location !== 'undefined' ? location.origin : '') => `${origin}/?join=${encodeURIComponent(code)}`;

/** 주소창의 ?join= 을 저장하고 주소에서 지운다. 저장된 코드(없으면 null)를 돌려준다. */
export function captureInvite(): string | null {
  try {
    const u = new URL(location.href);
    const c = u.searchParams.get('join');
    if (c) {
      const code = c.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
      if (code) write(code);
      u.searchParams.delete('join');
      history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    }
  } catch { /* 비브라우저 */ }
  return read();
}
export const pendingInvite = read;
export const clearInvite = () => write(null);
