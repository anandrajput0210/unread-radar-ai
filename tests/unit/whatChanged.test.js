import test from "node:test";
import assert from "node:assert/strict";
import { diffSessions } from "../../src/lib/views/whatChanged.js";

function task({
  id = "task-1",
  text = "Send the project report",
  quote = "Please send the project report",
  messageIndex = 0,
  owner = null,
  dueDate = null,
  resolvedDueDate = null,
  lifecycleEvents = [],
} = {}) {
  return {
    id,
    text,
    owner,
    dueDate,
    resolvedDueDate,
    lifecycleEvents,
    sourceEvidence: { quote, messageIndex },
  };
}

function session(actions, sourceMessageFingerprints = ["message-1"]) {
  return {
    analysis: { actions },
    sourceMessageFingerprints,
  };
}

test("reports an owner change with both old and new values", () => {
  const previous = session([task({ owner: "Morgan" })]);
  const current = session([task({ owner: "Priya" })]);

  const diff = diffSessions(previous, current);

  assert.equal(diff.changedOwner.length, 1);
  assert.equal(diff.changedOwner[0].oldValue, "Morgan");
  assert.equal(diff.changedOwner[0].newValue, "Priya");
  assert.equal(diff.unchanged, 0);
});

test("reports a newly ambiguous owner as a change to unknown", () => {
  const previous = session([task({ owner: "Ravi" })]);
  const current = session([task({ owner: null, ownerBasis: "ambiguous" })]);

  const diff = diffSessions(previous, current);

  assert.equal(diff.changedOwner.length, 1);
  assert.equal(diff.changedOwner[0].oldValue, "Ravi");
  assert.equal(diff.changedOwner[0].newValue, null);
  assert.equal(diff.unchanged, 0);
});

test("reports a task resolved only when the new analysis has a completion or cancellation event", () => {
  const previous = session([task()]);
  const notResolved = diffSessions(previous, session([
    task({ lifecycleEvents: [] }),
    task({ id: "task-2", quote: "Please send the other report", lifecycleEvents: [] }),
  ]));
  assert.equal(notResolved.resolvedTasks.length, 0);

  const resolved = diffSessions(previous, session([
    task({
      lifecycleEvents: [{
        type: "completed",
        text: "The project report was sent",
        sourceSpan: { startOffset: 20, endOffset: 50 },
      }],
    }),
  ]));
  assert.equal(resolved.resolvedTasks.length, 1);
  assert.equal(resolved.resolvedTasks[0].lifecycleType, "completed");
});

test("does not merge similar tasks with different evidence", () => {
  const diff = diffSessions(session([]), session([
    task({ quote: "Please send the project report", messageIndex: 0 }),
    task({ id: "task-2", quote: "Please send the project report tomorrow", messageIndex: 1 }),
  ], ["message-1", "message-2"]));

  assert.equal(diff.newTasks.length, 2);
  assert.equal(diff.newTasks[0].quote, "Please send the project report");
  assert.equal(diff.newTasks[1].quote, "Please send the project report tomorrow");
  assert.equal(diff.unchanged, 0);
});

test("marks ambiguous duplicate evidence as possibly the same instead of merging it", () => {
  const previous = session([
    task({ id: "previous-1" }),
    task({ id: "previous-2" }),
  ]);
  const current = session([task({ id: "current-1" })]);

  const diff = diffSessions(previous, current);

  assert.equal(diff.newTasks.length, 1);
  assert.equal(diff.newTasks[0].possiblySame, true);
  assert.equal(diff.unchanged, 0);
});

test("uses source ranges to distinguish the same quote at different message indexes", () => {
  const previous = {
    analysis: {
      actions: [{
        ...task({ quote: "Please send the report" }),
        sourceEvidence: { quote: "Please send the report", startOffset: 4, endOffset: 26 },
      }],
    },
    sourceMessageRanges: [{ startOffset: 0, endOffset: 30 }, { startOffset: 31, endOffset: 60 }],
    sourceMessageFingerprints: ["first", "second"],
  };
  const current = {
    analysis: {
      actions: [{
        ...task({ quote: "Please send the report" }),
        sourceEvidence: { quote: "Please send the report", startOffset: 35, endOffset: 57 },
      }],
    },
    sourceMessageRanges: [{ startOffset: 0, endOffset: 30 }, { startOffset: 31, endOffset: 60 }],
    sourceMessageFingerprints: ["first", "second"],
  };

  const diff = diffSessions(previous, current);

  assert.equal(diff.unchanged, 0);
  assert.equal(diff.newTasks.length, 1);
  assert.equal(diff.newTasks[0].messageIndex, 1);
});

test("identical analyses have an empty diff", () => {
  const previous = session([task({ owner: "Morgan", dueDate: "Friday" })]);
  const current = session([task({ owner: "Morgan", dueDate: "Friday" })]);

  const diff = diffSessions(previous, current);

  assert.deepEqual(diff, {
    newTasks: [],
    resolvedTasks: [],
    changedOwner: [],
    changedDue: [],
    unchanged: 1,
  });
});

test("diff output does not describe tasks as missed or overdue", () => {
  const diff = diffSessions(
    session([task({ owner: "Morgan", dueDate: "Friday" })]),
    session([task({ owner: "Priya", dueDate: "Monday" })]),
  );

  assert.doesNotMatch(JSON.stringify(diff), /\b(missed|overdue)\b/iu);
});
