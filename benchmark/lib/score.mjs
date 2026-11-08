// Scores extractor output against gold annotations, message-level.
import { analyzeConversations } from "../../src/lib/extraction/index.js";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";

const norm = (s) => String(s ?? "").toLocaleLowerCase().replace(/^@/, "").trim();
export const sameOwner = (pred, gold) => {
  if (!pred || !gold) return false;
  const p = norm(pred), g = norm(gold);
  return p === g || p.split(/\s+/)[0] === g.split(/\s+/)[0];
};
export const dueOf = (a) => (typeof a.resolvedDueDate === "string" ? a.resolvedDueDate : a.resolvedDueDate?.date || a.resolvedDueDate?.iso || null);

export function messageIndex(chat, action) {
  const pos = action.sourceSpan?.startOffset;
  return chat.messages.find((m) => pos >= m.start && pos < m.end)?.index ?? -1;
}

function emptyCounts() {
  return { gold: 0, tp: 0, fp: 0, dup: 0, ownerN: 0, ownerOk: 0, ownerFalse: 0, dueN: 0, dueOk: 0, dueSpurious: 0, possibleTp: 0, possibleFp: 0, lcN: 0, lcOk: 0, evN: 0, evOk: 0, misses: [], falsePos: [] };
}

// Evidence-reference validity. EVERY reference the UI can show must be independently checked:
// the task's own quote, its acknowledgement, each supporting-context item, each lifecycle event,
// and each review-queue item. A reference is valid only if all of these hold:
//   1. the pipeline marked it "valid"
//   2. chat.text.slice(startOffset, endOffset) === quote (exact, checked here, not trusted)
//   3. the range lies inside exactly one source message
//   4. for a task's own quote: that message is the message the task was extracted from
// A reference that cannot be mapped to a message FAILS (it must never pass by default).
// Offsets are half-open [start, end): a range must lie fully inside exactly one message, so a
// quote that swallows the newline separating two messages fails.
const messageAt = (chat, start, end) => {
  const hits = chat.messages.filter((m) => start >= m.start && end <= m.end);
  return hits.length === 1 ? hits[0].index : -1;
};

export function referenceOk(chat, ref, status, expectedMsg) {
  if (!ref || status !== "valid") return false;
  const { startOffset: a, endOffset: b, quote } = ref;
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || typeof quote !== "string" || !quote) return false;
  if (chat.text.slice(a, b) !== quote) return false;
  const msg = messageAt(chat, a, b);
  if (msg === -1) return false;
  return expectedMsg === undefined || msg === expectedMsg;
}

async function evidenceChecks(chat) {
  const shown = await analyzeTextWithRules(chat.text);
  const out = [];
  for (const a of shown.actions) {
    const outcome = a.outcome || "confirmed";
    const own = messageIndex(chat, a);
    const push = (ok) => out.push({ outcome, ok });
    push(own !== -1 && referenceOk(chat, a.sourceEvidence, a.sourceReferenceStatus, own));
    if (a.acknowledgementSpan) push(referenceOk(chat, a.acknowledgementEvidence, a.acknowledgementReferenceStatus));
    for (const d of a.supportingEvidence || []) push(referenceOk(chat, d.evidence, d.sourceReferenceStatus));
    for (const e of a.lifecycleEvents || []) push(referenceOk(chat, e.evidence, e.sourceReferenceStatus));
  }
  for (const q of shown.reviewQueue || []) out.push({ outcome: "possible", ok: referenceOk(chat, q.sourceEvidence, q.sourceReferenceStatus) });
  return out;
}

export async function scoreChat(chat, mode) {
  const result = analyzeConversations(chat.text);
  const preds = result.actions
    .map((a) => ({ a, msg: messageIndex(chat, a), outcome: a.outcome || "confirmed" }))
    .filter((p) => mode === "lenient" || p.outcome === "confirmed");
  const c = emptyCounts();
  for (const e of await evidenceChecks(chat)) {
    if (mode === "lenient" || e.outcome === "confirmed") { c.evN++; if (e.ok) c.evOk++; }
  }
  // Gold tasks marked level=possible are suggestions/proposals: they are expected only in
  // lenient mode. In strict mode they are neither required nor penalised.
  const goldList = mode === "strict" ? chat.goldTasks.filter((g) => g.level !== "possible") : chat.goldTasks;
  const ignored = new Set(mode === "strict" ? chat.goldTasks.filter((g) => g.level === "possible").flatMap((g) => g.msgs) : []);
  c.gold = goldList.length;
  const used = new Set();
  const goldMsgs = new Set(goldList.flatMap((g) => g.msgs));
  for (const g of goldList) {
    const cands = preds.filter((p) => !used.has(p) && g.msgs.includes(p.msg));
    const pick = cands.find((p) => sameOwner(p.a.owner, g.owner)) || cands[0];
    if (!pick) { c.misses.push(`${chat.id}/${g.id}: ${chat.messages[g.msgs[0]].body.slice(0, 70)}`); continue; }
    used.add(pick); c.tp++;
    if (pick.outcome === "possible") c.possibleTp++;
    if (g.owner) { c.ownerN++; if (sameOwner(pick.a.owner, g.owner)) c.ownerOk++; }
    else if (pick.a.owner) c.ownerFalse++;
    if (g.status) { c.lcN++; if ((pick.a.lifecycleStatus || "open") === g.status) c.lcOk++; }
    if (g.due) { c.dueN++; if (dueOf(pick.a) === g.due) c.dueOk++; }
    else if (dueOf(pick.a)) c.dueSpurious++;
  }
  for (const p of preds) {
    if (used.has(p) || ignored.has(p.msg)) continue;
    if (goldMsgs.has(p.msg)) c.dup++;
    else { c.fp++; if (p.outcome === "possible") c.possibleFp++; c.falsePos.push(`${chat.id}: ${chat.messages[p.msg]?.body.slice(0, 70) ?? p.a.text}`); }
  }
  return c;
}

const add = (x, y) => {
  for (const k of Object.keys(x)) Array.isArray(x[k]) ? x[k].push(...y[k]) : (x[k] += y[k]);
  return x;
};
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

export function summarize(c) {
  return {
    goldTasks: c.gold, found: c.tp, missed: c.gold - c.tp, falsePositives: c.fp, duplicates: c.dup, duplicateRate: pct(c.dup, c.tp + c.fp + c.dup),
    lifecycleAccuracy: pct(c.lcOk, c.lcN), lifecycleChecked: c.lcN, evidenceValidity: pct(c.evOk, c.evN), evidenceChecked: c.evN,
    precision: pct(c.tp, c.tp + c.fp), recall: pct(c.tp, c.gold),
    ownerAccuracy: pct(c.ownerOk, c.ownerN), ownerFalseAssignments: c.ownerFalse,
    deadlineAccuracy: pct(c.dueOk, c.dueN), spuriousDeadlines: c.dueSpurious,
    possibleTier: { truePositives: c.possibleTp, falsePositives: c.possibleFp },
  };
}

export async function scoreSplit(chats) {
  const out = {};
  for (const mode of ["strict", "lenient"]) {
    const total = emptyCounts();
    const byCat = {};
    for (const chat of chats) {
      const c = await scoreChat(chat, mode);
      add(total, c);
      for (const cat of chat.cats) add((byCat[cat] ||= emptyCounts()), c);
    }
    out[mode] = { overall: summarize(total), categories: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, summarize(v)])), _detail: { misses: total.misses, falsePos: total.falsePos } };
  }
  return out;
}
