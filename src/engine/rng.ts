import { Card, newDeck } from './cards';

/** 결정론적 시드 RNG (mulberry32). 재현 가능한 테스트/시뮬레이션용. */
export interface RNG { next(): number; int(n: number): number }

export function createRng(seed: number): RNG {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // 편향 없는 정수: 거부 샘플링
  const int = (n: number) => {
    if (n <= 0) throw new Error('int(n) requires n>0');
    const limit = Math.floor(4294967296 / n) * n;
    let x: number;
    do { x = Math.floor(next() * 4294967296); } while (x >= limit);
    return x % n;
  };
  return { next, int };
}

/** 일반 게임용 시드: Web Crypto 사용. */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}

/** Fisher–Yates 셔플. 난이도·사용자와 무관하게 동일한 알고리즘. */
export function shuffledDeck(rng: RNG): Card[] {
  const d = newDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
