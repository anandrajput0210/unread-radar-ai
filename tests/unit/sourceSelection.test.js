import test from "node:test";
import assert from "node:assert/strict";
import { resolveSourceMessageIndex } from "../../src/lib/views/sourceSelection.js";

const snapshot = {
  snapshotId: "snapshot-current",
  messages: [
    { startOffset: 0, endOffset: 24, rawText: "Alex: Send the report." },
    { startOffset: 25, endOffset: 51, rawText: "Maria: I will send it." },
  ],
};

test("a valid reference resolves to the containing source-snapshot message", () => {
  assert.equal(resolveSourceMessageIndex(snapshot, {
    snapshotId: "snapshot-current",
    startOffset: 31,
    endOffset: 39,
  }, "valid"), 1);
});

test("an invalid source-reference status never selects a message", () => {
  assert.equal(resolveSourceMessageIndex(snapshot, {
    snapshotId: "snapshot-current",
    startOffset: 31,
    endOffset: 39,
  }, "invalid"), null);
});

test("a reference from another snapshot never selects a message", () => {
  assert.equal(resolveSourceMessageIndex(snapshot, {
    snapshotId: "snapshot-old",
    startOffset: 31,
    endOffset: 39,
  }, "valid"), null);
});

test("a range outside any recognized message is not highlighted", () => {
  assert.equal(resolveSourceMessageIndex(snapshot, {
    snapshotId: "snapshot-current",
    startOffset: 23,
    endOffset: 30,
  }, "valid"), null);
});
