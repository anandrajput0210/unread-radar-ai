import test from "node:test";
import assert from "node:assert/strict";
import { buildPriorityView } from "../../src/lib/views/priorityView.js";

const span = (startOffset, endOffset) => ({ startOffset, endOffset });

test("counts each task once and attaches same-message deadline and urgency as context", () => {
  const analysis = {
    actions: [
      { id: "deck", text: "Update the executive deck", owner: "Maria", urgency: "Medium", sourceSpan: span(0, 80) },
      { id: "hotel", text: "Look into hotel pricing", owner: "Mike", urgency: "High", sourceSpan: span(81, 170) },
      { id: "request", text: "Send feature requests", owner: null, urgency: "Low", sourceSpan: span(171, 220) },
    ],
    deadlines: [
      { id: "friday", text: "Maria: update the deck by Friday 5 PM", dates: ["Friday", "5 PM"], urgency: "Medium", sourceSpan: span(0, 80) },
      { id: "monday", text: "Mike: hotel pricing must be finalized by Monday", dates: ["Monday"], urgency: "High", sourceSpan: span(81, 170) },
    ],
    urgentRows: [
      { id: "urgent-hotel", text: "Mike: hotel pricing is urgent", urgency: "High", sourceSpan: span(81, 170) },
    ],
    mentions: [],
  };

  const view = buildPriorityView(analysis);
  assert.equal(view.uniqueTaskCount, 3);
  assert.equal(view.standaloneSignalCount, 0);
  assert.equal(view.uniquePriorityCount, 3);
  assert.deepEqual(view.taskCounts, { High: 1, Medium: 1, Low: 1 });
  assert.deepEqual(view.counts, { High: 1, Medium: 1, Low: 1 });
  assert.equal(view.linkedSignalCount, 3);
  assert.equal(view.tasks.find((item) => item.id === "hotel").linkedSignals.length, 2);
  assert.deepEqual(view.supportingSignalCounts, { deadlines: 2, urgentMessages: 1, mentions: 0 });
});

test("does not guess a relationship for a signal without a source identity", () => {
  const view = buildPriorityView({
    actions: [{ id: "task-1", text: "Review the release", urgency: "Medium" }],
    deadlines: [{ text: "A separate note says Friday", dates: ["Friday"], urgency: "Medium" }],
    urgentRows: [],
    mentions: [],
  });
  assert.equal(view.uniqueTaskCount, 1);
  assert.equal(view.standaloneSignalCount, 1);
  assert.equal(view.uniquePriorityCount, 2);
});

test("groups multiple standalone signal types from one message into one priority item", () => {
  const sourceSpan = span(10, 55);
  const view = buildPriorityView({
    actions: [],
    deadlines: [{ text: "Critical outage due today", dates: ["today"], urgency: "High", sourceSpan }],
    urgentRows: [{ text: "Critical outage due today", reason: "Service impact", urgency: "High", sourceSpan }],
    mentions: [],
  });
  assert.equal(view.standaloneSignalCount, 1);
  assert.equal(view.uniquePriorityCount, 1);
  assert.equal(view.standaloneSignals[0].signals.length, 2);
  assert.equal(view.counts.High, 1);
});

test("the six-message project demo counts four candidates (including the collective roadmap obligation), not six overlapping signals", async () => {
  const { readFile } = await import("node:fs/promises");
  const { analyzeTextWithRules } = await import("../../src/lib/ai/localAiEngine.js");
  const demo = await readFile(new URL("../../examples/demo-six-message-chat.txt", import.meta.url), "utf8");
  const analysis = await analyzeTextWithRules(demo);
  const view = buildPriorityView(analysis);

  assert.equal(view.uniqueTaskCount, 4);
  assert.equal(view.uniquePriorityCount, 4);
  assert.equal(view.linkedSignalCount, 3);
  assert.equal(view.standaloneSignalCount, 0);
  assert.deepEqual(view.taskCounts, { High: 1, Medium: 1, Low: 2 });
  assert.equal(analysis.modelExecution, undefined, "rules-only analysis must not claim that Qwen inference ran");
});
