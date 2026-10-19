// mulberry32: tiny, fast, good enough for gameplay; state is a uint32 kept in GameState.rng.
export interface RngResult<T> { value: T; next: number }

export function nextFloat(state: number): RngResult<number> {
  const next = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(next ^ (next >>> 15), next | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, next };
}

export function nextRange(state: number, min: number, max: number): RngResult<number> {
  const r = nextFloat(state);
  return { value: min + r.value * (max - min), next: r.next };
}

export function nextInt(state: number, min: number, maxInclusive: number): RngResult<number> {
  const r = nextFloat(state);
  return { value: min + Math.floor(r.value * (maxInclusive - min + 1)), next: r.next };
}

/** Always consumes exactly one draw so call sequences stay stable regardless of p. */
export function chance(state: number, p: number): RngResult<boolean> {
  const r = nextFloat(state);
  return { value: r.value < p, next: r.next };
}

export function pickWeighted<T>(state: number, items: ReadonlyArray<{ item: T; weight: number }>): RngResult<T | null> {
  const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
  if (total <= 0) return { value: null, next: state };
  const r = nextFloat(state);
  let acc = r.value * total;
  for (const i of items) {
    acc -= Math.max(0, i.weight);
    if (acc < 0) return { value: i.item, next: r.next };
  }
  return { value: items[items.length - 1]!.item, next: r.next };
}
