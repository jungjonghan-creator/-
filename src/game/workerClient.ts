import { createRng } from '../engine/rng';
import { mttAdvance, mttSimToEnd } from './mtt';
import type { Session } from './session';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (s: Session) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; sess?: Session; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      e.data.ok ? p.resolve(e.data.sess!) : p.reject(new Error(e.data.error));
    };
    worker.onerror = () => { worker = null; };
    return worker;
  } catch { return null; }
}

/** 워커에서 mttAdvance 실행. 워커를 쓸 수 없으면 메인 스레드로 대체(동일 결과: 시드 결정론). */
export function mttAdvanceAsync(sess: Session, seed: number): Promise<Session> {
  const w = getWorker();
  if (!w) return Promise.resolve(mttAdvance(sess, createRng(seed)));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, sess, seed });
  });
}

/** 사람이 탈락한 뒤 남은 대회를 끝까지 시뮬레이션해 최종 순위를 확정한다 */
export function mttSimToEndAsync(sess: Session, seed: number): Promise<Session> {
  const w = getWorker();
  if (!w) return Promise.resolve(mttSimToEnd(sess, createRng(seed)));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, sess, seed, kind: 'toEnd' });
  });
}
