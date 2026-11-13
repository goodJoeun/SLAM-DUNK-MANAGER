// 시드 고정 난수 (같은 시드 = 같은 경기). mulberry32
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p: number) => next() < p,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    gauss(mean = 0, sd = 1) {
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    // 가중치 배열에서 인덱스 하나 추첨
    weighted(weights: number[]) {
      const total = weights.reduce((s, w) => s + w, 0);
      let x = next() * total;
      for (let i = 0; i < weights.length; i++) {
        x -= weights[i];
        if (x <= 0) return i;
      }
      return weights.length - 1;
    },
  };
}

export type Rng = ReturnType<typeof makeRng>;
