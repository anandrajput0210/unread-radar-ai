import test from "node:test";
import assert from "node:assert/strict";

import {
  TASK_STATUSES,
  countTaskStatuses,
  getTaskStatus,
  promoteReviewCandidate,
  rejectReviewCandidate,
  updateTaskStatus,
} from "../../src/lib/views/taskWorkflow.js";

test("newly extracted tasks start in needs-review", () => {
  assert.equal(getTaskStatus({}, "task-1"), "needs-review");
});

test("task status updates are immutable and only accept known values", () => {
  const original = { "task-1": "confirmed" };
  const updated = updateTaskStatus(original, "task-2", "in-progress");
  assert.deepEqual(original, { "task-1": "confirmed" });
  assert.deepEqual(updated, { "task-1": "confirmed", "task-2": "in-progress" });
  assert.throws(() => updateTaskStatus(updated, "task-3", "invented"), /Unsupported/);
  assert.throws(() => updateTaskStatus(updated, "", "completed"), /task ID/);
});

test("status counts include a needs-review default and ignore unknown status values", () => {
  const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const counts = countTaskStatuses(tasks, {
    b: "confirmed",
    c: "completed",
    d: "unknown",
  });
  assert.deepEqual(counts, {
    "needs-review": 2,
    confirmed: 1,
    "in-progress": 0,
    completed: 1,
    rejected: 0,
  });
  assert.deepEqual(Object.keys(counts), TASK_STATUSES);
});

const source = (startOffset, endOffset, messageId = "message-1") => ({
  quote: "Source message",
  startOffset,
  endOffset,
  messageId,
  snapshotId: "snapshot-1",
});

test("promoting a review candidate preserves evidence without assigning suggested owner or deadline", () => {
  const candidate = {
    id: "candidate-1",
    text: "Check the incident log",
    sourceSpan: { startOffset: 12, endOffset: 32 },
    sourceEvidence: source(12, 32),
    owner: "Priya",
    dueDate: "Friday",
    resolvedDueDate: "2026-11-27",
    outcome: "possible",
    outcomeReason: "Needs a human decision",
  };
  const promoted = promoteReviewCandidate([], candidate);
  assert.equal(promoted.duplicate, false);
  assert.equal(promoted.actions[0].owner, null);
  assert.equal(promoted.actions[0].dueDate, null);
  assert.equal(promoted.actions[0].humanReviewStatus, "promoted");
  assert.equal(promoted.actions[0].outcome, "possible");
  assert.equal(promoted.actions[0].outcomeReason, "Needs a human decision");
  assert.equal(promoted.actions[0].extractionOutcomeReason, "Needs a human decision");
  assert.equal(promoted.actions[0].sourceEvidence, candidate.sourceEvidence);
  assert.equal(promoted.actions[0].suggestedOwner, "Priya");
  assert.equal(promoted.actions[0].suggestedDueDate, "Friday");
  assert.equal(promoted.actions[0].suggestedResolvedDueDate, "2026-11-27");
});

test("identical descriptions at different source offsets remain distinct tasks", () => {
  const first = { id: "candidate-a", text: "Review the report", sourceEvidence: source(4, 21, "message-1") };
  const second = { id: "candidate-b", text: "Review the report", sourceEvidence: source(40, 57, "message-2") };
  const firstPromotion = promoteReviewCandidate([], first);
  const secondPromotion = promoteReviewCandidate(firstPromotion.actions, second);
  assert.equal(firstPromotion.duplicate, false);
  assert.equal(secondPromotion.duplicate, false);
  assert.equal(secondPromotion.actions.length, 2);
});

test("distinct tasks from one conversation can be promoted and the same candidate cannot be promoted twice", () => {
  const first = { id: "candidate-a", text: "Review the report", sourceEvidence: source(4, 21, "message-1") };
  const second = { id: "candidate-b", text: "Review the report", sourceEvidence: source(40, 57, "message-2") };
  const firstPromotion = promoteReviewCandidate([], first);
  const sameCandidate = promoteReviewCandidate(firstPromotion.actions, first);
  const secondPromotion = promoteReviewCandidate(firstPromotion.actions, second);
  assert.equal(sameCandidate.duplicate, true);
  assert.equal(sameCandidate.actions.length, 1);
  assert.equal(secondPromotion.duplicate, false);
  assert.equal(secondPromotion.actions.length, 2);
});

test("same candidate ID at different source references creates distinct task IDs", () => {
  const first = { id: "candidate-repeat", text: "Review the report", sourceEvidence: source(4, 21, "message-1") };
  const second = { id: "candidate-repeat", text: "Review the report", sourceEvidence: source(40, 57, "message-2") };
  const firstPromotion = promoteReviewCandidate([], first);
  const secondPromotion = promoteReviewCandidate(firstPromotion.actions, second);
  assert.equal(secondPromotion.duplicate, false);
  assert.equal(secondPromotion.actions.length, 2);
  assert.notEqual(secondPromotion.actions[0].id, secondPromotion.actions[1].id);
});

test("a promoted task is not duplicated and rejection stays separate from completion", () => {
  const candidate = { id: "candidate-2", text: "Review the report", sourceSpan: { startOffset: 4, endOffset: 21 }, sourceEvidence: source(4, 21) };
  const promoted = promoteReviewCandidate([], candidate);
  assert.equal(promoteReviewCandidate(promoted.actions, candidate).duplicate, true);
  const decisions = rejectReviewCandidate({}, candidate.id, "2026-11-25T12:00:00.000Z");
  assert.equal(decisions[candidate.id].decision, "rejected");
  assert.equal(decisions[candidate.id].reviewedAt, "2026-11-25T12:00:00.000Z");
  assert.equal(promoted.actions[0].completed, false);
  assert.equal(promoted.actions[0].lifecycleStatus, "open");
});
