// Vocabulary for the schema-v2 gold format and scorer. Pure functions.
const key = (v) => String(v ?? "").trim().toLocaleLowerCase().replace(/[\s-]+/g, "_");

export const END_STATES = ["open", "in_progress", "delayed", "blocked", "completed", "cancelled"];
// "assigned" is the creation of an owned task, scored through the owner. It is NOT an event.
export const EVENT_TYPES = ["acknowledged", "reassigned", "started", "delayed", "blocked", "unblocked", "resumed", "completed", "cancelled"];
export const CONDITION_STATES = ["pending", "satisfied", "rejected", "revoked", "ambiguous"];
export const CLASSES = ["confirmed", "possible", "none"];
export const BASES = ["named", "accepted", "self", "reassigned", "none"];
export const LINK_NONE = new Set(["unknown", "ambiguous", "none"]);

const END_ALIAS = { inprogress: "in_progress", started: "in_progress", canceled: "cancelled", done: "completed" };
/** Strict: for gold labels. Returns a canonical end state or null when not recognised. */
export function normalizeEnd(v) {
  const k = key(v);
  const out = END_ALIAS[k] ?? k;
  return END_STATES.includes(out) ? out : null;
}
// The extractor reports its own statuses; those that mean "still open" collapse to open.
const PRED_END_ALIAS = { assigned: "open", acknowledged: "open", reassigned: "open" };
export function normalizePredEnd(v) {
  const k = key(v || "open");
  return PRED_END_ALIAS[k] ?? normalizeEnd(k) ?? k;
}
const EVENT_ALIAS = { in_progress: "started", inprogress: "started", ack: "acknowledged", done: "completed", canceled: "cancelled" };
/** Returns a canonical event type, or null when not recognised. */
export function normalizeEvent(v) {
  const k = key(v);
  const out = EVENT_ALIAS[k] ?? k;
  return EVENT_TYPES.includes(out) ? out : null;
}
const COND_ALIAS = { pending_verification: "pending", reported_satisfied: "satisfied", reported_rejected: "rejected", reported_revoked: "revoked" };
export function normalizeCondition(v) {
  const k = key(v);
  return COND_ALIAS[k] ?? k;
}
