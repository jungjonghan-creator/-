/// <reference lib="webworker" />
import { createRng } from '../engine/rng';
import { mttAdvance } from './mtt';
import type { Session } from './session';

// MTT 의 오프스크린 테이블 시뮬레이션처럼 무거운 계산을 UI 스레드 밖에서 실행한다.
self.onmessage = (e: MessageEvent<{ id: number; sess: Session; seed: number }>) => {
  const { id, sess, seed } = e.data;
  try {
    const out = mttAdvance(sess, createRng(seed));
    (self as unknown as Worker).postMessage({ id, ok: true, sess: out });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: (err as Error).message });
  }
};
