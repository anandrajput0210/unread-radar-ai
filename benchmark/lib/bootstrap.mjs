// Conversation-level clustered bootstrap. Tasks inside one chat are not independent, so whole
// chats are resampled with replacement. Deterministic: fixed seed, fixed resample count.
export const DEFAULT_RESAMPLES = 10000;
export const DEFAULT_SEED = 20261108;
export const MAX_EXCLUDED_SHARE = 0.05;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * perChat: array of numeric-count objects, one per conversation.
 * metrics: { name: { n: "countKey", d: "countKey" | ["k1","k2"] } } ; value = sum(n)/sum(d).
 * A resample whose denominator is 0 is excluded from that metric and counted. If more than 5% of
 * resamples are excluded the interval is reported as "unavailable" rather than guessed.
 */
export function bootstrapIntervals(perChat, metrics, { resamples = DEFAULT_RESAMPLES, seed = DEFAULT_SEED } = {}) {
  const N = perChat.length;
  const dsum = (d, row) => (Array.isArray(d) ? d.reduce((a, k) => a + (row[k] || 0), 0) : row[d] || 0);
  const out = {};
  const rand = mulberry32(seed);
  const picks = Array.from({ length: resamples }, () => Array.from({ length: N }, () => Math.floor(rand() * N)));
  for (const [name, { n, d }] of Object.entries(metrics)) {
    const num = perChat.map((r) => r[n] || 0);
    const den = perChat.map((r) => dsum(d, r));
    const totalN = num.reduce((a, b) => a + b, 0);
    const totalD = den.reduce((a, b) => a + b, 0);
    const values = [];
    let excluded = 0;
    for (const pick of picks) {
      let sn = 0, sd = 0;
      for (const i of pick) { sn += num[i]; sd += den[i]; }
      if (sd === 0) excluded++; else values.push(sn / sd);
    }
    values.sort((a, b) => a - b);
    const at = (q) => values[Math.min(values.length - 1, Math.max(0, Math.floor(q * values.length)))];
    const unavailable = N === 0 || excluded / resamples > MAX_EXCLUDED_SHARE || values.length === 0;
    out[name] = {
      numerator: totalN, denominator: totalD, estimate: totalD ? totalN / totalD : null,
      ci95: unavailable ? null : [at(0.025), at(0.975)],
      status: unavailable ? "unavailable" : "ok", excludedResamples: excluded, resamples, seed,
    };
  }
  return out;
}
