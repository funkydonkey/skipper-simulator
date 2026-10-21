/** Unsigned 32-bit FNV-1a over the parts joined with "|". Never touches state.rng. */
export function seedHash(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(parts.join('|'))) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
