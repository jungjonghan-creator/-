/** WebCrypto 기반 비밀번호 해시(PBKDF2-SHA256)와 세션 토큰. Cloudflare Workers 의 PBKDF2 상한(100,000회)에 맞춘다. */
export const PBKDF2_ITERATIONS = 100_000;
const enc = new TextEncoder();
export const b64 = (buf: ArrayBuffer | Uint8Array): string => { const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
export const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const randomB64 = (n = 32) => b64(crypto.getRandomValues(new Uint8Array(n)));
export const randomId = () => crypto.randomUUID();

export async function hashPassword(password: string, saltB64: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations }, key, 256);
  return b64(bits);
}
/** 상수 시간 비교 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
