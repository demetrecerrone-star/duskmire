/**
 * Mulberry32. Same seed ⇒ same sequence in the browser and in Node.
 */
export function createRng(seed = (Math.random() * 0x100000000) >>> 0) {
  let state = seed >>> 0;
  return {
    seed: state,
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** Inclusive integer on [min, max]. */
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
  };
}

export function hashSeed(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
