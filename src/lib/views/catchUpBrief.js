/**
 * Catch-up brief: groups already-extracted tasks into "what is waiting on whom".
 * Pure functions over analysis output. Nothing here changes extraction.
 *
 * Safety rules (each has a test):
 *  - A task is "assigned to you" only when the owner clearly is you AND you are
 *    a speaker in this chat. A bare first name shared by two speakers is
 *    "might be you", never a claim. An owner proves assignment, not that
 *    anyone is waiting, so labels say "assigned".
 *  - A possible (unconfirmed) task is never counted as waiting on anyone.
 *  - "Past due" needs an explicit, ISO-resolved due date strictly before the
 *    as-of date, and the task must be open. It says "no completion message
 *    found in this chat", never "missed": silence in a chat is not proof the work is undone.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** True only for a real calendar date written exactly as YYYY-MM-DD. */
export function isRealIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
const CLOSED_LIFECYCLE = new Set(["completed", "cancelled"]);
const CLOSED_MANUAL = new Set(["completed", "rejected"]);
const GROUNDED_OWNER_SOURCES = new Set([
  "claimed_by_commitment",
  "claimed_by_progress",
  "unique_acknowledgement",
  "conversation_reassignment",
]);

export const PAST_DUE_LABEL = "Past due · no completion message found in this chat";

function tokens(name) {
  return String(name ?? "")
    .normalize("NFC")
    .replace(/^@/u, "")
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter(Boolean);
}

const isSubset = (small, big) => small.length > 0 && small.every((t) => big.includes(t));

/** "yes" | "no" | "unsure" | "none". Whole-token matching only. */
export function ownerMatch(owner, me, speakers = []) {
  const ownerTokens = tokens(owner);
  const meTokens = tokens(me);
  if (!ownerTokens.length || !meTokens.length) return "none";
  if (ownerTokens.join(" ") === meTokens.join(" ")) return "yes";
  const related = isSubset(ownerTokens, meTokens) || isSubset(meTokens, ownerTokens);
  if (!related) return "no";
  // The owner text could also mean someone else in the chat.
  const meKey = meTokens.join(" ");
  const rivals = (Array.isArray(speakers) ? speakers : []).filter((s) => {
    const t = tokens(s);
    return t.join(" ") !== meKey && (isSubset(ownerTokens, t) || isSubset(t, ownerTokens));
  });
  return rivals.length ? "unsure" : "yes";
}

export function listSpeakers(snapshot) {
  const seen = new Set();
  const out = [];
  for (const message of Array.isArray(snapshot?.messages) ? snapshot.messages : []) {
    if (message?.kind !== "message" || typeof message.authorRaw !== "string") continue;
    const name = message.authorRaw.trim();
    if (name && !seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}

function isClosed(task, statuses) {
  return CLOSED_LIFECYCLE.has(task.lifecycleStatus) || CLOSED_MANUAL.has(statuses?.[task.id]);
}

function hasHumanReviewed(task, statuses) {
  return task.humanReviewStatus === "promoted"
    || statuses?.[task.id] === "confirmed"
    || statuses?.[task.id] === "in-progress";
}

export function hasGroundedOwner(task) {
  return typeof task?.owner === "string"
    && task.owner.trim().length > 0
    && (task.classification === "assigned_task"
      || task.classification === "self_commitment"
      || GROUNDED_OWNER_SOURCES.has(task.ownerSource));
}

function isPastDue(task, asOf) {
  if (!asOf) return false;
  if (task.dueDateStatus !== "explicit") return false;
  const due = task.resolvedDueDate;
  return isRealIsoDate(due) && due < asOf;
}

export function buildCatchUpBrief(actions, { me = null, asOf = null, statuses = {}, speakers = [] } = {}) {
  const tasks = Array.isArray(actions) ? actions.filter((t) => t && typeof t === "object") : [];
  const asOfValid = isRealIsoDate(asOf);
  const asOfDate = asOfValid ? asOf : null;
  const speakerList = Array.isArray(speakers) ? speakers : [];
  const chosen = typeof me === "string" && me.trim().length > 0;
  const meKey = tokens(me).join(" ");
  // The chosen identity must be someone who actually speaks in this chat.
  const inChat = chosen && speakerList.some((name) => tokens(name).join(" ") === meKey);
  const hasMe = inChat;
  const identityNotInChat = chosen && !inChat;

  const groups = { assignedToYou: [], mightBeYou: [], assignedToOthers: [], assigned: [], noOwner: [], needsReview: [] };
  let done = 0;

  for (const task of tasks) {
    if (isClosed(task, statuses)) { done += 1; continue; }
    if (task.outcome !== "confirmed" && !hasHumanReviewed(task, statuses)) {
      groups.needsReview.push(task);
      continue;
    }
    if (task.ownerBasis === "ambiguous") {
      groups.mightBeYou.push(task);
      continue;
    }
    if (!hasGroundedOwner(task)) { groups.noOwner.push(task); continue; }
    if (!hasMe) { groups.assigned.push(task); continue; }
    const match = ownerMatch(task.owner, me, speakers);
    if (match === "yes") groups.assignedToYou.push(task);
    else if (match === "unsure") groups.mightBeYou.push(task);
    else groups.assignedToOthers.push(task);
  }

  const open = Object.values(groups).flat();
  const pastDue = open.filter((t) => t.outcome === "confirmed" && isPastDue(t, asOfDate));
  const blockedOrDelayed = open.filter((t) => t.lifecycleStatus === "blocked" || t.lifecycleStatus === "delayed");

  return {
    groups,
    pastDue,
    pastDueLabel: PAST_DUE_LABEL,
    blockedOrDelayed,
    needsIdentity: !hasMe,
    identityNotInChat,
    asOfValid,
    counts: {
      open: open.length,
      done,
      pastDue: pastDue.length,
      assignedToYou: groups.assignedToYou.length,
      needsReview: groups.needsReview.length,
    },
  };
}
