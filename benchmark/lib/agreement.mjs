// Annotator-agreement helpers for the pilot. Pure functions, no I/O.
/** Cohen's kappa for two equal-length arrays of categorical labels (aligned candidate units). */
export function cohenKappa(a, b) {
  if (a.length !== b.length) throw new Error("kappa needs equal-length label arrays");
  const n = a.length;
  if (!n) return { kappa: null, observed: null, expected: null, n: 0 };
  const cats = [...new Set([...a, ...b])];
  const observed = a.filter((x, i) => x === b[i]).length / n;
  const expected = cats.reduce((s, c) => s + (a.filter((x) => x === c).length / n) * (b.filter((x) => x === c).length / n), 0);
  const kappa = expected === 1 ? (observed === 1 ? 1 : 0) : (observed - expected) / (1 - expected);
  return { kappa, observed, expected, n };
}
/**
 * Candidate discovery agreement. Inputs are sets of candidate keys (for example "C014:msg5") from
 * each annotator after alignment. High field-level kappa on aligned units can hide poor discovery,
 * so report the one-only counts and their share of the union.
 */
export function discoveryAgreement(candidatesA, candidatesB) {
  const A = new Set(candidatesA), B = new Set(candidatesB);
  const both = [...A].filter((k) => B.has(k)).length;
  const onlyA = A.size - both, onlyB = B.size - both;
  const union = A.size + B.size - both;
  return { both, onlyA, onlyB, union, onlyOneAnnotatorShare: union ? (onlyA + onlyB) / union : null, jaccard: union ? both / union : null };
}
