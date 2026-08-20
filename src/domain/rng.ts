/**
 * FNV-1a 32-bit hash. Deterministic across all machines and Node versions.
 * Parts are joined with '|' as separator before hashing.
 * @example
 * stableHash('a', 'b') !== stableHash('ab')  // separator matters
 */
export function stableHash(...parts: ReadonlyArray<string | number>): number {
  let h = 0x811c9dc5; // offset basis
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0; // FNV prime, uint32 arithmetic
  }
  return h >>> 0;
}
