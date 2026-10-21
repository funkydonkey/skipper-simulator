/**
 * Unsigned 32-bit FNV-1a over the parts joined with "|", then murmur3's finalizer. Raw FNV-1a keys that
 * differ only in a trailing digit barely differ in any bit, so `seedHash(...) % n` would alternate;
 * the avalanche makes every bit depend on every input byte. Never touches state.rng.
 */
export function seedHash(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(parts.join('|'))) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
