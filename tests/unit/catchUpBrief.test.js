import test from "node:test";
import assert from "node:assert/strict";
import { buildCatchUpBrief, listSpeakers, ownerMatch } from "../../src/lib/views/catchUpBrief.js";

const task = (over = {}) => ({
  id: over.id ?? "t1", text: "send the report", owner: null, outcome: "confirmed",
  lifecycleStatus: "open", dueDate: "Friday", dueDateStatus: "explicit", resolvedDueDate: null, ...over,
  classification: over.classification ?? (over.owner ? "assigned_task" : undefined),
});
const ids = (list) => list.map((t) => t.id);

// ---- ownerMatch: must never claim a task for the wrong person ----
test("ownerMatch: exact and first-name matches when unambiguous", () => {
  const speakers = ["Bella Martin", "Priya Nair"];
  assert.equal(ownerMatch("Bella Martin", "Bella Martin", speakers), "yes");
  assert.equal(ownerMatch("Bella", "Bella Martin", speakers), "yes");
  assert.equal(ownerMatch("Priya", "Bella Martin", speakers), "no");
});

test("ownerMatch: two speakers share the first name, so a bare first name is only 'unsure'", () => {
  const speakers = ["Bella Martin", "Bella Khan", "Priya Nair"];
  assert.equal(ownerMatch("Bella", "Bella Martin", speakers), "unsure");
  assert.equal(ownerMatch("Bella Khan", "Bella Martin", speakers), "no");
  assert.equal(ownerMatch("Bella Martin", "Bella Martin", speakers), "yes");
});

test("ownerMatch: no owner or no identity is never a match; substrings are not matches", () => {
  assert.equal(ownerMatch(null, "Bella Martin", ["Bella Martin"]), "none");
  assert.equal(ownerMatch("Bella", null, ["Bella Martin"]), "none");
  assert.equal(ownerMatch("Ann", "Mary Ann", ["Mary Ann", "Ann Lee"]), "unsure"); // whole-token only, and Ann Lee exists
  assert.equal(ownerMatch("Ann", "Joanna", ["Joanna"]), "no");
});

// ---- grouping ----
test("tasks land in exactly one primary group", () => {
  const speakers = ["Me", "Dev"];
  const b = buildCatchUpBrief([
    task({ id: "a", owner: "Me" }), task({ id: "b", owner: "Dev" }), task({ id: "c", owner: null }),
    task({ id: "d", owner: "Me", outcome: "possible" }),
  ], { me: "Me", asOf: "2026-11-10", speakers });
  assert.deepEqual(ids(b.groups.assignedToYou), ["a"]);
  assert.deepEqual(ids(b.groups.assignedToOthers), ["b"]);
  assert.deepEqual(ids(b.groups.noOwner), ["c"]);
  assert.deepEqual(ids(b.groups.needsReview), ["d"]);
  const all = Object.values(b.groups).flat();
  assert.equal(new Set(ids(all)).size, all.length);
});

test("a possible task is never counted as waiting on anyone", () => {
  const b = buildCatchUpBrief([task({ owner: "Me", outcome: "possible" })], { me: "Me", asOf: "2026-11-10", speakers: ["Me"] });
  assert.equal(b.groups.assignedToYou.length, 0);
  assert.equal(b.groups.needsReview.length, 1);
});

test("user-accepted possible tasks leave human review without gaining an owner", () => {
  const b = buildCatchUpBrief([
    task({ id: "unreviewed", owner: null, outcome: "possible" }),
    task({ id: "promoted", owner: null, outcome: "possible", humanReviewStatus: "promoted" }),
    task({ id: "confirmed", owner: null, outcome: "possible" }),
    task({ id: "in-progress", owner: null, outcome: "possible" }),
  ], {
    me: "Me",
    asOf: "2026-11-10",
    speakers: ["Me"],
    statuses: { confirmed: "confirmed", "in-progress": "in-progress" },
  });

  assert.deepEqual(ids(b.groups.needsReview), ["unreviewed"]);
  assert.deepEqual(ids(b.groups.noOwner), ["promoted", "confirmed", "in-progress"]);
  assert.equal(b.groups.assignedToYou.length, 0);
  assert.equal(b.groups.assignedToOthers.length, 0);
  assert.equal(b.counts.open, 4);
});

test("no identity chosen: owned tasks are not assigned to 'you' or 'others'", () => {
  const b = buildCatchUpBrief([task({ owner: "Dev" })], { me: null, asOf: "2026-11-10", speakers: ["Dev"] });
  assert.equal(b.needsIdentity, true);
  assert.equal(b.groups.assignedToYou.length, 0);
  assert.equal(b.groups.assignedToOthers.length, 0);
  assert.equal(b.groups.assigned.length, 1);
});

test("owner without structured assignment provenance is not placed under a person", () => {
  const b = buildCatchUpBrief([
    task({ owner: "Priya", classification: "unclassified_candidate" }),
  ], { me: "Priya", asOf: "2026-11-10", speakers: ["Priya"] });

  assert.equal(b.groups.assignedToYou.length, 0);
  assert.equal(b.groups.assignedToOthers.length, 0);
  assert.deepEqual(ids(b.groups.noOwner), ["t1"]);
});

test("ambiguous owner name goes to 'might be you', not 'waiting on you'", () => {
  const b = buildCatchUpBrief([task({ owner: "Bella" })], { me: "Bella Martin", asOf: "2026-11-10", speakers: ["Bella Martin", "Bella Khan"] });
  assert.equal(b.groups.assignedToYou.length, 0);
  assert.equal(b.groups.mightBeYou.length, 1);
});

test("owner already marked ambiguous stays in the ambiguous group without assigning a speaker", () => {
  const b = buildCatchUpBrief([
    task({ owner: null, ownerBasis: "ambiguous", classification: "assigned_task" }),
  ], {
    me: "Ravi Mehta",
    speakers: ["Ravi Mehta", "Ravi Shah"],
  });

  assert.equal(b.groups.assignedToYou.length, 0);
  assert.equal(b.groups.mightBeYou.length, 1);
  assert.equal(b.groups.mightBeYou[0].owner, null);
});

test("completed, cancelled and manually closed tasks leave the waiting groups", () => {
  const speakers = ["Me"];
  const b = buildCatchUpBrief([
    task({ id: "done", owner: "Me", lifecycleStatus: "completed" }),
    task({ id: "gone", owner: "Me", lifecycleStatus: "cancelled" }),
    task({ id: "manual", owner: "Me" }), task({ id: "rej", owner: "Me" }),
    task({ id: "live", owner: "Me" }),
  ], { me: "Me", asOf: "2026-11-10", speakers, statuses: { manual: "completed", rej: "rejected" } });
  assert.deepEqual(ids(b.groups.assignedToYou), ["live"]);
  assert.equal(b.counts.done, 4);
});

// ---- past due: conservative, never says "missed" ----
test("past due needs an explicit resolved ISO date strictly before asOf", () => {
  const speakers = ["Me"];
  const mk = (extra) => buildCatchUpBrief([task({ owner: "Me", ...extra })], { me: "Me", asOf: "2026-11-10", speakers });
  assert.equal(mk({ resolvedDueDate: "2026-11-09" }).pastDue.length, 1);
  assert.equal(mk({ resolvedDueDate: "2026-11-10" }).pastDue.length, 0);   // due today is not past due
  assert.equal(mk({ resolvedDueDate: "2026-11-12" }).pastDue.length, 0);
  assert.equal(mk({ resolvedDueDate: null }).pastDue.length, 0);
  assert.equal(mk({ resolvedDueDate: "Friday" }).pastDue.length, 0);       // not ISO
  assert.equal(mk({ resolvedDueDate: "2026-11-09", dueDateStatus: "contextual" }).pastDue.length, 0);
});

test("completed or cancelled tasks are never past due, and the label does not say missed", () => {
  const b = buildCatchUpBrief([
    task({ id: "a", owner: "Me", resolvedDueDate: "2026-11-01", lifecycleStatus: "completed" }),
    task({ id: "b", owner: "Me", resolvedDueDate: "2026-11-01", lifecycleStatus: "cancelled" }),
    task({ id: "c", owner: "Me", resolvedDueDate: "2026-11-01" }),
  ], { me: "Me", asOf: "2026-11-10", speakers: ["Me"] });
  assert.deepEqual(ids(b.pastDue), ["c"]);
  assert.match(b.pastDueLabel, /no completion message found in this chat/i);
  assert.doesNotMatch(b.pastDueLabel, /missed|failed|late/i);
});

test("an invalid asOf date disables past-due instead of guessing", () => {
  const b = buildCatchUpBrief([task({ owner: "Me", resolvedDueDate: "2026-11-01" })], { me: "Me", asOf: "tomorrow", speakers: ["Me"] });
  assert.equal(b.pastDue.length, 0);
  assert.equal(b.asOfValid, false);
});

test("blocked and delayed open tasks are flagged, not hidden", () => {
  const b = buildCatchUpBrief([
    task({ id: "x", owner: "Dev", lifecycleStatus: "blocked" }),
    task({ id: "y", owner: "Dev", lifecycleStatus: "delayed" }),
    task({ id: "z", owner: "Dev" }),
  ], { me: "Me", asOf: "2026-11-10", speakers: ["Me", "Dev"] });
  assert.deepEqual(ids(b.blockedOrDelayed), ["x", "y"]);
});

test("listSpeakers returns unique authored speakers only", () => {
  const snap = { messages: [
    { kind: "message", authorRaw: "Dev" }, { kind: "message", authorRaw: "Dev" },
    { kind: "system", authorRaw: null }, { kind: "message", authorRaw: "Priya" },
  ] };
  assert.deepEqual(listSpeakers(snap), ["Dev", "Priya"]);
  assert.deepEqual(listSpeakers(null), []);
});

test("garbage input does not throw", () => {
  const b = buildCatchUpBrief(undefined, {});
  assert.equal(Object.values(b.groups).flat().length, 0);
});

// ---- review round: identity, strict dates, labels ----
test("an identity that is not a speaker in this chat is ignored, not trusted", () => {
  const b = buildCatchUpBrief([task({ owner: "Bella" })], { me: "Bella Martin", asOf: "2026-11-10", speakers: ["Dev", "Priya"] });
  assert.equal(b.needsIdentity, true);
  assert.equal(b.identityNotInChat, true);
  assert.equal(b.groups.assignedToYou.length, 0);
  assert.equal(b.groups.assigned.length, 1);
});

test("no speakers known (opaque import): nothing can be assigned to you", () => {
  const b = buildCatchUpBrief([task({ owner: "Bella" })], { me: "Bella", asOf: "2026-11-10", speakers: [] });
  assert.equal(b.groups.assignedToYou.length, 0);
  assert.equal(b.needsIdentity, true);
});

test("impossible calendar dates are rejected for asOf and for due dates", () => {
  const speakers = ["Me"];
  for (const bad of ["2026-02-31", "2026-13-01", "2026-00-10", "2026-04-31", "2025-02-29"]) {
    const b = buildCatchUpBrief([task({ owner: "Me", resolvedDueDate: "2020-01-01" })], { me: "Me", asOf: bad, speakers });
    assert.equal(b.asOfValid, false, `${bad} must be invalid as asOf`);
    assert.equal(b.pastDue.length, 0);
    const c = buildCatchUpBrief([task({ owner: "Me", resolvedDueDate: bad })], { me: "Me", asOf: "2026-12-31", speakers });
    assert.equal(c.pastDue.length, 0, `${bad} must not count as a due date`);
  }
  const leap = buildCatchUpBrief([task({ owner: "Me", resolvedDueDate: "2028-02-29" })], { me: "Me", asOf: "2028-03-01", speakers });
  assert.equal(leap.pastDue.length, 1);
});

test("labels say assigned, never waiting, and past due says 'in this chat'", () => {
  const b = buildCatchUpBrief([], {});
  assert.match(b.pastDueLabel, /in this chat/i);
  assert.ok(!("waitingOnYou" in b.groups) && !("waitingOnOthers" in b.groups));
});
