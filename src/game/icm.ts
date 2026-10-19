/** Malmuth–Harville ICM. stacks.length ≤ 10 권장 (재귀 O(n!)). 반환: 각 플레이어의 기대 상금 */
export function icm(stacks: number[], payouts: number[]): number[] {
  const n = stacks.length;
  const pays = payouts.slice(0, n);
  while (pays.length < n) pays.push(0);
  const total = stacks.reduce((a, b) => a + b, 0);
  const memo = new Map<number, number[]>();
  function rec(mask: number, place: number): number[] {
    // mask: 이미 순위가 결정된 플레이어 집합. 남은 사람들에 대해 place 번째 상금부터 분배
    const key = mask * 16 + place;
    const cached = memo.get(key);
    if (cached) return cached;
    const res = new Array(n).fill(0);
    if (place >= n || mask === (1 << n) - 1) { memo.set(key, res); return res; }
    let remain = 0;
    for (let i = 0; i < n; i++) if (!(mask & (1 << i))) remain += stacks[i];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) continue;
      const p = remain > 0 ? stacks[i] / remain : 1 / (n - popcount(mask));
      res[i] += p * pays[place];
      const sub = rec(mask | (1 << i), place + 1);
      for (let j = 0; j < n; j++) res[j] += p * sub[j];
    }
    memo.set(key, res);
    return res;
  }
  void total;
  return rec(0, 0);
}
const popcount = (x: number) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };

/** 상금 구조: 상위 ~15% 입상, 가중치 1/(i+1)^1.3 */
export function payoutStructure(entrants: number, buyIn: number): number[] {
  const places = Math.max(entrants >= 18 ? 3 : 1, Math.round(entrants * 0.15));
  const w = Array.from({ length: places }, (_, i) => 1 / Math.pow(i + 1, 1.3));
  const sum = w.reduce((a, b) => a + b, 0);
  const pool = buyIn * entrants;
  const pays = w.map((x) => Math.floor((x / sum) * pool));
  pays[0] += pool - pays.reduce((a, b) => a + b, 0); // 반올림 잔여는 우승 상금에
  return pays;
}

/** 싯앤고 상금 구조 (가상 바이인 기준): 헤즈업 승자독식, 6인 65/35, 9인 50/30/20 */
export function sngPayouts(entrants: number, buyIn: number): number[] {
  const pool = buyIn * entrants;
  const w = entrants <= 2 ? [1] : entrants <= 6 ? [0.65, 0.35] : [0.5, 0.3, 0.2];
  const p = w.map((x) => Math.floor(x * pool));
  p[0] += pool - p.reduce((a, b) => a + b, 0);
  return p;
}
