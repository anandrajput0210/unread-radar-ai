import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSplit, parseChatFile } from "../../benchmark/lib/loadCases.mjs";
import { scoreSplit } from "../../benchmark/lib/score.mjs";
import { scoreChatV2, scoreSplitV2 } from "../../benchmark/lib/scoreV2.mjs";
import { bootstrapIntervals } from "../../benchmark/lib/bootstrap.mjs";
import { cohenKappa, discoveryAgreement } from "../../benchmark/lib/agreement.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---- helpers: synthetic predictions so every metric is tested against a known answer ----------
const chatOf = (text) => parseChatFile(text, "test.chat")[0];
const HEADER = "@chat id=c1 split=schema cats=schema start=02/11/2026";
// One predicted action sitting on message `msg` of `chat`.
const pred = (chat, msg, extra = {}) => {
  const m = chat.messages[msg];
  return { text: m.body, owner: null, outcome: "confirmed", lifecycleStatus: "open", lifecycleEvents: [], sourceSpan: { startOffset: m.start + 1, endOffset: m.end }, ...extra };
};
const evt = (chat, msg, type) => ({ type, sourceSpan: { startOffset: chat.messages[msg].start + 1, endOffset: chat.messages[msg].end } });
const run = (chat, actions, mode = "lenient") => scoreChatV2(chat, mode, () => ({ actions }));

// ---- 1. Parity with the legacy scorer on the real dev split (release gate) ---------------------
test("v2 preserves legacy dev counts except the intentional strict possible-message false-positive fix", async () => {
  const chats = loadSplit(root, "dev");
  const legacy = await scoreSplit(chats);
  const v2 = scoreSplitV2(chats, { bootstrap: false });
  for (const mode of ["strict", "lenient"]) {
    const l = legacy[mode].overall, c = v2[mode].counts;
    assert.equal(c.tp, l.found, `${mode} tp`);
    // The legacy strict scorer hides every finding on a message containing a possible gold task.
    // V2 now filters only that possible candidate, so the one unrelated confirmed prediction in
    // d-am-pronoun is correctly counted as an FP. The legacy CLI and ratchet remain unchanged.
    assert.equal(c.fp, l.falsePositives + (mode === "strict" ? 1 : 0), `${mode} fp`);
    assert.equal(c.dup, l.duplicates, `${mode} duplicates`);
    assert.equal(c.gold, l.goldTasks, `${mode} gold`);
    assert.equal(c.fabricatedOwner, l.ownerFalseAssignments, `${mode} fabricated == legacy wrong-owner-assigned`);
    assert.equal(c.ownerOk, Math.round((l.ownerAccuracy / 100) * c.ownerKnown), `${mode} owner ok`);
    assert.equal(c.dueSpurious, l.spuriousDeadlines, `${mode} spurious deadline`);
    assert.ok(c.endN > 0, `${mode}: legacy status= labels must still be counted (none silently dropped)`);
    assert.equal(c.endN, l.lifecycleChecked, `${mode} end-state denominator`);
    assert.equal(c.ownerOk, Math.round((l.ownerAccuracy / 100) * c.ownerKnown), `${mode} owner identity`);
  }
});

// ---- 2. Loader: new attributes parse, legacy attributes unchanged ------------------------------
test("loader reads schema-v2 attributes and leaves legacy fields alone", () => {
  const chats = loadSplit(root, "schema");
  const ack = chats.find((c) => c.id === "s-ack-update");
  assert.equal(ack.eventsComplete, true);
  assert.equal(ack.goldTasks.length, 1, "events are not tasks");
  assert.equal(ack.goldEvents.length, 2);
  assert.equal(ack.goldEvents[0].type, "acknowledged");
  assert.equal(ack.goldEvents[0].msg, 1);
  assert.equal(ack.goldEvents[0].link, "t1");
  assert.equal(ack.goldTasks[0].tid, "C001-T001");
  assert.equal(ack.goldTasks[0].ownerKind, "known");
  assert.equal(chats.find((c) => c.id === "s-near-miss").notTasks.length, 1);
  assert.equal(chats.find((c) => c.id === "s-near-miss").goldTasks.length, 0);

  const legacy = chatOf(`${HEADER}\n10:00 A: Zed, do it. => t1 owner=- due=- status=open\n10:01 B: Bo, do that. => t2 owner=Bo`);
  assert.equal(legacy.gold.t1.owner, null);
  assert.equal(legacy.gold.t1.ownerKind, "unknown");
  assert.equal(legacy.gold.t2.owner, "Bo");
  assert.equal(legacy.gold.t2.ownerKind, "known");
  const amb = chatOf(`${HEADER}\n10:00 A: Priya or Rahul, do it. => t1 owner=~`);
  assert.equal(amb.gold.t1.owner, null);
  assert.equal(amb.gold.t1.ownerKind, "ambiguous");
  const compound = chatOf(`${HEADER}\n10:00 A: Ana and Bo, prepare the demo. => t1 owner="Ana and Bo"`);
  assert.equal(compound.gold.t1.owner, "Ana and Bo", "multi-token names must be quoted in the annotation DSL");
});

// ---- 3. Owner metrics ---------------------------------------------------------------------------
const OWNERS = `${HEADER}
10:00 Rahul: Priya, send the report. => t1 owner=Priya
10:01 Rahul: Someone book the hotel. => t2 owner=-
10:02 Rahul: Priya or Mina, check the invoice. => t3 owner=~
10:03 Rahul: Mina, call the vendor. => t4 owner=Mina
10:04 Rahul: Mina, update the slides. => t5 owner=Mina`;

test("wrong owner, fabricated owner, correct abstention and missed owner are counted separately", () => {
  const chat = chatOf(OWNERS);
  const c = run(chat, [
    pred(chat, 0, { owner: "Priya" }),   // correct
    pred(chat, 1, { owner: "Admin" }),   // gold unknown, extractor guessed -> fabricated
    pred(chat, 2, { owner: null }),      // gold ambiguous, abstained -> correct abstention
    pred(chat, 3, { owner: "Rahul" }),   // gold Mina, said Rahul -> wrong owner
    pred(chat, 4, { owner: null }),      // gold Mina, abstained -> missed owner
  ]);
  assert.equal(c.ownerKnown, 3);
  assert.equal(c.ownerOk, 1);
  assert.equal(c.wrongOwner, 1);
  assert.equal(c.missedOwner, 1);
  assert.equal(c.ownerNotKnown, 2);
  assert.equal(c.fabricatedOwner, 1);
  assert.equal(c.correctAbstention, 1);
});

test("an invented task with an invented owner cannot escape the owner metrics", () => {
  const chat = chatOf(`${HEADER}\n10:00 Sam: Lunch was good.\n10:01 Sam: See you.`);
  const c = run(chat, [pred(chat, 0, { owner: "Admin" })]);
  assert.equal(c.fp, 1);
  assert.equal(c.unsupportedOwnerOnUnmatched, 1);
  assert.equal(c.ownerNotInSource, 1, "Admin does not appear anywhere in the chat");
  assert.equal(c.chatsWithFp, 1);
  assert.equal(c.negativeControl, 1);
  assert.equal(c.negativeControlFp, 1);
});

// ---- 4. One-to-one matching, duplicates, strict vs lenient --------------------------------------
test("two predictions on one gold task: one match, one duplicate (no recall inflation)", () => {
  const chat = chatOf(`${HEADER}\n10:00 Rahul: Priya, send the report. => t1 owner=Priya`);
  const c = run(chat, [pred(chat, 0, { owner: "Priya" }), pred(chat, 0, { owner: "Priya", text: "send it" })]);
  assert.equal(c.tp, 1);
  assert.equal(c.dup, 1);
  assert.equal(c.fp, 0);
});

test("strict mode neither requires nor penalises a gold possible task; lenient requires it", () => {
  const chat = chatOf(`${HEADER}\n10:00 Sam: The files you sent are corrupted. => t1 class=possible owner=-`);
  const possible = pred(chat, 0, { outcome: "possible" });
  assert.equal(run(chat, [possible], "strict").gold, 0);
  assert.equal(run(chat, [possible], "strict").fp, 0);
  assert.equal(run(chat, [possible], "lenient").tp, 1);
  // A confirmed prediction against a gold-possible task is overconfident (lenient) and ignored (strict).
  const confirmed = pred(chat, 0, { outcome: "confirmed" });
  assert.equal(run(chat, [confirmed], "lenient").overconfident, 1);
  assert.equal(run(chat, [confirmed], "strict").tp, 0);
  assert.equal(run(chat, [confirmed], "strict").fp, 1, "a confirmed prediction cannot hide behind a possible gold item on the same message");
  // A possible prediction against a gold-confirmed task is underconfident.
  const chat2 = chatOf(`${HEADER}\n10:00 Sam: Priya, send it. => t1 owner=Priya`);
  assert.equal(run(chat2, [pred(chat2, 0, { owner: "Priya", outcome: "possible" })], "lenient").underconfident, 1);
});

// ---- 5. Events, links, end state, conditions ------------------------------------------------------
const EVENTS = `${HEADER} events=full
10:00 Rahul: Priya, send the report. => t1 owner=Priya end=completed
10:05 Priya: Sure, I will send it. => ev type=acknowledged link=t1
10:30 Priya: Report sent. => ev type=completed link=t1
10:31 Priya: ok. => ev type=acknowledged link=ambiguous`;

test("acknowledgement attached to the right task scores as a link and an event hit", () => {
  const chat = chatOf(EVENTS);
  const c = run(chat, [pred(chat, 0, { owner: "Priya", lifecycleStatus: "completed", lifecycleEvents: [evt(chat, 1, "acknowledged"), evt(chat, 2, "completed")] })]);
  assert.equal(c.eventDetected, 2);
  assert.equal(c.eventLinkedOk, 2);
  assert.equal(c.linkN, 2);
  assert.equal(c.linkOk, 2);
  assert.equal(c.linkAbstainN, 0, "an undetected event has no predicted link to score");
  assert.equal(c.linkAbstainOk, 0);
  assert.equal(c.endOk, 1);
  assert.equal(c.eventFp, 0);
});

test("an acknowledgement that becomes its own task is a false positive and a missed event", () => {
  const chat = chatOf(EVENTS);
  const c = run(chat, [
    pred(chat, 0, { owner: "Priya", lifecycleStatus: "completed", lifecycleEvents: [evt(chat, 2, "completed")] }),
    pred(chat, 1, { owner: "Priya", text: "send it" }),
  ]);
  assert.equal(c.fp, 1);
  // Detection is independent of linking: the acknowledgement at msg 1 and the one on the ambiguous
  // message at msg 3 were both never detected as events.
  assert.equal(c.eventMissed, 2);
  assert.equal(c.linkMissed, 1);
});

test("an event attached to the wrong task, and a fabricated link on an ambiguous message, are counted", () => {
  const chat = chatOf(`${HEADER} events=full
10:00 Rahul: Priya, send the report. => t1 owner=Priya
10:01 Rahul: Priya, update the notes. => t2 owner=Priya
10:02 Priya: Done with the notes. => ev type=completed link=t2
10:03 Priya: I'll handle it. => ev type=acknowledged link=ambiguous`);
  const c = run(chat, [
    pred(chat, 0, { owner: "Priya", lifecycleEvents: [evt(chat, 2, "completed"), evt(chat, 3, "acknowledged")] }),
    pred(chat, 1, { owner: "Priya" }),
  ]);
  assert.equal(c.linkWrong, 1, "completion attached to t1, gold says t2");
  assert.equal(c.eventDetectedWrongLink, 1);
  assert.equal(c.linkFabricated, 1, "the extractor picked a task for an ambiguous acknowledgement");
});

test("event precision is only scored on chats declared events=full", () => {
  const open = chatOf(`${HEADER}\n10:00 Rahul: Priya, send it. => t1 owner=Priya\n10:01 Priya: ok`);
  const c = run(open, [pred(open, 0, { owner: "Priya", lifecycleEvents: [evt(open, 1, "acknowledged")] })]);
  assert.equal(c.predEventsScored, 0);
  assert.equal(c.eventFp, 0);
});

test("end states and condition states are normalised before comparison", () => {
  const chat = chatOf(`${HEADER}
10:00 Sam: Zed, deploy once QA signs off. => t1 owner=Zed end=in_progress cond=satisfied
10:01 Sam: Zed, ship the build. => t2 owner=Zed cond=pending`);
  const c = run(chat, [
    pred(chat, 0, { owner: "Zed", lifecycleStatus: "in-progress", condition: "once QA signs off", conditionStatus: "reported_satisfied" }),
    pred(chat, 1, { owner: "Zed", condition: "Once the build is ready", conditionStatus: "pending_verification" }),
  ]);
  assert.equal(c.endN, 1);
  assert.equal(c.endOk, 1);
  assert.equal(c.condN, 2);
  assert.equal(c.condOk, 2);
});

// ---- 6. Clustered bootstrap -------------------------------------------------------------------------
test("bootstrap is deterministic for a fixed seed and resamples whole chats", () => {
  const rows = [{ n: 1, d: 1 }, { n: 0, d: 1 }, { n: 1, d: 1 }, { n: 1, d: 1 }];
  const spec = { m: { n: "n", d: "d" } };
  const a = bootstrapIntervals(rows, spec, { resamples: 2000, seed: 7 });
  const b = bootstrapIntervals(rows, spec, { resamples: 2000, seed: 7 });
  assert.deepEqual(a, b);
  assert.equal(a.m.estimate, 0.75);
  assert.ok(a.m.ci95[0] <= 0.75 && a.m.ci95[1] >= 0.75);
  assert.equal(a.m.resamples, 2000);
  assert.equal(a.m.seed, 7);
});

test("bootstrap excludes zero-denominator resamples and reports them; many exclusions make it unavailable", () => {
  const sparse = [{ n: 1, d: 1 }, ...Array.from({ length: 29 }, () => ({ n: 0, d: 0 }))];
  const r = bootstrapIntervals(sparse, { m: { n: "n", d: "d" } }, { resamples: 4000, seed: 3 });
  assert.ok(r.m.excludedResamples > 0, "some resamples never draw the one informative chat");
  assert.equal(r.m.status, "unavailable");
  assert.equal(r.m.ci95, null);
  const none = bootstrapIntervals([{ n: 0, d: 0 }], { m: { n: "n", d: "d" } }, { resamples: 100, seed: 1 });
  assert.equal(none.m.status, "unavailable");
  assert.equal(none.m.estimate, null);
  const solid = bootstrapIntervals(Array.from({ length: 20 }, () => ({ n: 1, d: 1 })), { m: { n: "n", d: "d" } }, { resamples: 500, seed: 1 });
  assert.deepEqual(solid.m.ci95, [1, 1]);
});

// ---- 7. Agreement helpers -----------------------------------------------------------------------------
test("Cohen's kappa and candidate-discovery agreement", () => {
  assert.equal(cohenKappa(["a", "b", "a", "b"], ["a", "b", "a", "b"]).kappa, 1);
  const k = cohenKappa(["y", "y", "n", "n"], ["y", "n", "n", "y"]);
  assert.equal(k.observed, 0.5);
  assert.equal(k.kappa, 0);
  assert.throws(() => cohenKappa(["a"], ["a", "b"]));
  const d = discoveryAgreement(["m1", "m2", "m3"], ["m2", "m3", "m4", "m5"]);
  assert.equal(d.both, 2);
  assert.equal(d.onlyA, 1);
  assert.equal(d.onlyB, 2);
  assert.equal(d.union, 5);
  assert.equal(d.onlyOneAnnotatorShare, 0.6);
});

// ---- 8. Known extraction gap surfaced by the new scorer (documented, not fixed here) -------------------
test("known gap: a pronoun-object commitment after a named assignment becomes a second task", { todo: "extraction is frozen during evaluation-infrastructure work; see docs" }, () => {
  const chats = loadSplit(root, "schema");
  const c = scoreSplitV2(chats.filter((x) => x.id === "s-ack-update"), { bootstrap: false }).lenient.counts;
  assert.equal(c.fp, 0, "an acknowledgement must update the existing task, not create another");
  assert.equal(c.eventDetected, 2);
});


// ======== Corrections from the independent scorer review (A to G) ==============================================

// A. Matching uses task wording, not only the message.
test("A: two tasks in one message are paired by their text, even when predictions arrive in the opposite order", () => {
  const chat = chatOf(`${HEADER}
10:00 Rahul: Priya, send the report and Mina, book the hotel. => t1 owner=Priya text="send the report" due=2026-11-06; t2 owner=Mina text="book the hotel" due=2026-11-09`);
  const m = chat.messages[0];
  const at = (needle) => ({ startOffset: chat.text.indexOf(needle), endOffset: chat.text.indexOf(needle) + needle.length });
  // Predictions listed hotel-first. A positional matcher would give Priya the hotel's deadline.
  const hotel = { text: "book the hotel", owner: "Mina", outcome: "confirmed", resolvedDueDate: "2026-11-09", lifecycleEvents: [], sourceSpan: at("book the hotel") };
  const report = { text: "send the report", owner: "Priya", outcome: "confirmed", resolvedDueDate: "2026-11-06", lifecycleEvents: [], sourceSpan: at("send the report") };
  const c = run(chat, [hotel, report]);
  assert.equal(c.tp, 2);
  assert.equal(c.ownerOk, 2);
  assert.equal(c.dueCorrect, 2, "each deadline lands on its own task");
  assert.equal(c.dueWrong, 0);
  assert.equal(c.unanchoredMultiTaskMessages, 0);
  assert.ok(m);
});

test("A: an unrelated extra finding on a gold message is a false positive, not a duplicate", () => {
  const chat = chatOf(`${HEADER}\n10:00 Rahul: Priya, send the report. Also the printer is broken again. => t1 owner=Priya text="send the report"`);
  const at = (needle) => ({ startOffset: chat.text.indexOf(needle), endOffset: chat.text.indexOf(needle) + needle.length });
  const c = run(chat, [
    { text: "send the report", owner: "Priya", outcome: "confirmed", lifecycleEvents: [], sourceSpan: at("send the report") },
    { text: "fix the printer", owner: null, outcome: "confirmed", lifecycleEvents: [], sourceSpan: at("the printer is broken again") },
  ]);
  assert.equal(c.tp, 1);
  assert.equal(c.fp, 1, "a separate unmatched task escapes neither the false-positive count");
  assert.equal(c.dup, 0);
  const restated = run(chat, [
    { text: "send the report", owner: "Priya", outcome: "confirmed", lifecycleEvents: [], sourceSpan: at("send the report") },
    { text: "send the report", owner: "Priya", outcome: "confirmed", lifecycleEvents: [], sourceSpan: at("send the report") },
  ]);
  assert.equal(restated.dup, 1);
  assert.equal(restated.fp, 0);
});

test("A: unanchored multi-task messages are reported, so annotation gaps are visible", () => {
  const chat = chatOf(`${HEADER}\n10:00 Rahul: Priya, send it and Mina, book it. => t1 owner=Priya; t2 owner=Mina`);
  assert.equal(run(chat, []).unanchoredMultiTaskMessages, 1);
});

// B. Detection and linking are independent.
test("B: a correctly detected acknowledgement with an ambiguous gold link is a detected event, not a false event", () => {
  const chat = chatOf(`${HEADER} events=full
10:00 Rahul: Priya, send the report. => t1 owner=Priya
10:01 Priya: I'll handle it. => ev type=acknowledged link=ambiguous`);
  const attached = run(chat, [pred(chat, 0, { owner: "Priya", lifecycleEvents: [evt(chat, 1, "acknowledged")] })]);
  assert.equal(attached.eventDetected, 1, "the event itself was found");
  assert.equal(attached.eventFp, 0, "so it is not a false event");
  assert.equal(attached.linkFabricated, 1, "but picking a task for an ambiguous message is a fabricated link");
  const unattached = run(chat, [pred(chat, 0, { owner: "Priya" }), pred(chat, 1, { owner: null, lifecycleEvents: [evt(chat, 1, "acknowledged")] })]);
  assert.equal(unattached.linkAbstainOk, 1, "an event on a task that matches no gold task attaches to nothing");
});

// C. Duplicates lower precision.
test("C: one correct finding plus one duplicate is 50% precision, with the duplicate-free figure reported separately", async () => {
  const { summarizeV2 } = await import("../../benchmark/lib/scoreV2.mjs");
  const chat = chatOf(`${HEADER}\n10:00 Rahul: Priya, send the report. => t1 owner=Priya`);
  const c = run(chat, [pred(chat, 0, { owner: "Priya" }), pred(chat, 0, { owner: "Priya" })]);
  const s = summarizeV2(c);
  assert.equal(c.tp, 1);
  assert.equal(c.dup, 1);
  assert.equal(s.precision.value, 0.5);
  assert.equal(s.precisionExcludingDuplicates.value, 1);
  assert.equal(s.duplicateRate.value, 0.5);
});

// D. Deadline precision and recall.
test("D: a wrong date is an incorrect prediction AND a missed gold deadline; a spurious date hurts precision only", async () => {
  const { summarizeV2 } = await import("../../benchmark/lib/scoreV2.mjs");
  const chat = chatOf(`${HEADER}
10:00 Rahul: Priya, send the report by Friday. => t1 owner=Priya due=2026-11-06
10:01 Rahul: Mina, book the hotel. => t2 owner=Mina due=-
10:02 Rahul: Zed, pay the invoice by Monday. => t3 owner=Zed due=2026-11-09`);
  const c = run(chat, [
    pred(chat, 0, { owner: "Priya", resolvedDueDate: "2026-11-13" }),  // wrong date
    pred(chat, 1, { owner: "Mina", resolvedDueDate: "2026-11-10" }),   // gold has none: spurious
    pred(chat, 2, { owner: "Zed", resolvedDueDate: "2026-11-09" }),    // correct
  ]);
  const d = summarizeV2(c).deadline;
  assert.equal(c.predDue, 3);
  assert.equal(c.goldDue, 2);
  assert.equal(c.dueCorrect, 1);
  assert.equal(d.precision.n, 1); assert.equal(d.precision.d, 3);
  assert.equal(d.recall.n, 1); assert.equal(d.recall.d, 2);
  assert.equal(d.wrongDate, 1);
  assert.equal(d.spurious, 1);
});

test("D: a deadline on an unmatched prediction counts against deadline precision", () => {
  const chat = chatOf(`${HEADER}\n10:00 Sam: Lunch was good.`);
  const c = run(chat, [pred(chat, 0, { resolvedDueDate: "2026-11-06" })]);
  assert.equal(c.predDue, 1);
  assert.equal(c.dueOnUnmatched, 1);
  assert.equal(c.dueCorrect, 0);
});

// E. Owner-source matching is whole-token and Unicode-aware.
test("E: 'Ann' is not supported by the word 'planning'; whole names and Devanagari names are", () => {
  const planning = chatOf(`${HEADER}\n10:00 Sam: The planning meeting is at noon.`);
  assert.equal(run(planning, [pred(planning, 0, { owner: "Ann" })]).ownerNotInSource, 1, "'ann' only occurs inside 'planning'");
  const names = chatOf(`${HEADER}\n10:00 Sam: Mary Ann, call Aman and \u0906\u0930\u0935 now.`);
  const wrap = (owner) => run(names, [pred(names, 0, { owner })]).ownerNotInSource;
  assert.equal(wrap("Mary Ann"), 0, "both whole tokens occur");
  assert.equal(wrap("@Aman"), 0);
  assert.equal(wrap("\u0906\u0930\u0935"), 0);
  assert.equal(wrap("Mary Zed"), 1, "one missing token is enough to be unsupported");
  assert.equal(wrap("Mar"), 1, "a prefix of a name is not the name");
});

// F. Event vocabulary: unsupported types are rejected, not silently accepted.
test("F: the loader rejects 'assigned' and other unsupported values with the file and line", () => {
  assert.throws(() => chatOf(`${HEADER}\n10:00 A: Zed, do it. => t1 owner=Zed\n10:01 Zed: ok. => ev type=assigned link=t1`), /unsupported event type "assigned".*not an event/);
  assert.throws(() => chatOf(`${HEADER}\n10:00 A: Zed, do it. => t1 owner=Zed end=finished`), /unsupported end state "finished"/);
  assert.throws(() => chatOf(`${HEADER}\n10:00 A: Zed, do it. => t1 owner=Zed cond=met`), /unsupported condition state "met"/);
  assert.throws(() => chatOf(`${HEADER}\n10:00 A: Zed, do it. => t1 owner=Zed class=maybe`), /unsupported class "maybe"/);
  assert.throws(() => chatOf(`${HEADER}\n10:00 A: Zed, do it. => t1 owner=Zed basis=guessed`), /unsupported basis "guessed"/);
  assert.throws(() => chatOf(`${HEADER}\n10:00 A: Zed, do it. => t1 owner=Zed\n10:01 Zed: ok. => ev type=acknowledged link=t9`), /unknown task "t9"/);
  const ok = chatOf(`${HEADER}\n10:00 A: Zed, do it. => t1 owner=Zed\n10:01 Zed: ok. => ev type=in_progress link=t1`);
  assert.equal(ok.goldEvents[0].type, "started", "aliases normalise to the canonical vocabulary");
});

// G. Bootstrap covers every rate metric.
test("G: bootstrap intervals exist for every rate metric the summary reports", async () => {
  const { BOOTSTRAP_METRICS } = await import("../../benchmark/lib/scoreV2.mjs");
  for (const name of ["precision", "precisionExcludingDuplicates", "recall", "duplicateRate", "falsePositivesPerChat", "chatsWithFalsePositive", "ownerAccuracy", "wrongOwnerRate", "missedOwnerRate", "fabricatedOwnerRate", "correctAbstentionRate", "classificationAccuracy", "deadlinePrecision", "deadlineRecall", "endStateAccuracy", "conditionStateAccuracy", "linkAccuracy", "linkAbstentionRate", "eventRecall", "eventPrecision", "eventLinkedRecall"]) {
    assert.ok(BOOTSTRAP_METRICS[name], `no bootstrap spec for ${name}`);
  }
  const r = scoreSplitV2(loadSplit(root, "dev"), { bootstrapOptions: { resamples: 200 } });
  assert.deepEqual(Object.keys(r.strict.intervals).sort(), Object.keys(BOOTSTRAP_METRICS).sort());
  assert.equal(r.strict.intervals.deadlinePrecision.denominator > 0, true);
});

// H. Global task matching maximises cardinality before applying owner/text preferences.
test("H: global matching avoids a greedy choice that strands a second gold task", () => {
  const chat = chatOf(`${HEADER}
10:00 Rahul: Priya, send the report and Mina, book the hotel. => t1 owner=Priya text="send the report"; t2 owner=Mina text="book the hotel"`);
  const message = chat.messages[0];
  const bodyStart = message.start + message.line.indexOf(message.body);
  const wholeMessage = { startOffset: bodyStart, endOffset: message.end };
  const reportSpan = {
    startOffset: chat.text.indexOf("send the report", message.start),
    endOffset: chat.text.indexOf("send the report", message.start) + "send the report".length,
  };
  // p1 is the best local match for T1 (owner and wording), but its broad source span also makes it
  // the only compatible prediction for T2. p2 can only match T1. Global cardinality must assign
  // p2 -> T1 and reserve p1 -> T2 rather than taking the locally best first edge.
  const p1 = { text: "send the report", owner: "Priya", outcome: "confirmed", lifecycleEvents: [], sourceSpan: wholeMessage };
  const p2 = { text: "send the", owner: "Priya", outcome: "confirmed", lifecycleEvents: [], sourceSpan: reportSpan };
  const c = run(chat, [p1, p2]);
  assert.equal(c.tp, 2);
  assert.equal(c.gold, 2);
  assert.equal(c.ownerOk, 1);
  assert.equal(c.wrongOwner, 1, "maximum coverage is preferred to a locally attractive but incomplete assignment");
  assert.equal(c.fp, 0);
});

// I. One predicted event can match only one gold event, and only its matched event contributes a link.
test("I: one predicted event cannot satisfy multiple gold event links on the same message", () => {
  const chat = chatOf(`${HEADER} events=full
10:00 Rahul: Priya, send the report. => t1 owner=Priya
10:01 Priya: Sure, I'll send it. => ev type=acknowledged link=t1; ev type=completed link=t1`);
  const c = run(chat, [pred(chat, 0, {
    owner: "Priya",
    lifecycleEvents: [evt(chat, 1, "acknowledged")],
  })]);
  assert.equal(c.goldEvents, 2);
  assert.equal(c.eventDetected, 1);
  assert.equal(c.eventMissed, 1);
  assert.equal(c.linkN, 2);
  assert.equal(c.linkOk, 1);
  assert.equal(c.linkMissed, 1, "the acknowledgement cannot also link the missing completion event");
  assert.equal(c.eventLinkedOk, 1);
});

// J. Strict scoring excludes possible gold candidates, not every prediction from their message.
test("J: a separate confirmed false positive on a message with a possible gold task still counts in strict mode", () => {
  const chat = chatOf(`${HEADER}
10:00 Sam: The files you sent are corrupted, and Admin should restart the printer. => t1 class=possible owner=- text="files you sent are corrupted"`);
  const possible = { ...pred(chat, 0, { outcome: "possible", text: "files you sent are corrupted" }) };
  const unrelatedConfirmed = { ...pred(chat, 0, { outcome: "confirmed", owner: "Admin", text: "restart the printer" }) };
  const strict = run(chat, [possible, unrelatedConfirmed], "strict");
  assert.equal(strict.gold, 0);
  assert.equal(strict.tp, 0);
  assert.equal(strict.fp, 1);
  assert.equal(strict.unsupportedOwnerOnUnmatched, 1, "an owner on an unmatched finding is reported even when the name appears in the source");
  assert.equal(strict.ownerNotInSource, 0, "Admin is present as a whole name in the source");
});

// K. Full owner identity is compared, not only the first name.
test("K: different full names sharing a first token are different owners", () => {
  const chat = chatOf(`${HEADER}
10:00 Rahul: Mary Ann, send the report. Mary Zed is reviewing the plan. => t1 owner="Mary Ann" text="send the report"`);
  const c = run(chat, [pred(chat, 0, { owner: "Mary Zed", text: "send the report" })]);
  assert.equal(c.tp, 1);
  assert.equal(c.ownerKnown, 1);
  assert.equal(c.ownerOk, 0);
  assert.equal(c.wrongOwner, 1);
  assert.equal(c.ownerNotInSource, 0, "both names occur in the source, but they are not the same person");
});

test("schema fixtures: every message holding two or more tasks anchors each with text=", () => {
  for (const chat of loadSplit(root, "schema")) {
    const c = run(chat, [], "lenient");
    assert.equal(c.unanchoredMultiTaskMessages, 0, `${chat.id} has an unanchored multi-task message`);
  }
});
