import test from "node:test";
import assert from "node:assert/strict";

import { analyzeConversations, extractActions } from "../src/lib/conversationParser.js";
import { analyzeTextWithRules } from "../src/lib/localAiEngine.js";

const android = (time, speaker, message) => `12/10/24, ${time} - ${speaker}: ${message}`;

test("tracks assignment, acknowledgement, work in progress and completion with exact evidence", () => {
  const input = [
    android("2:01 pm", "Alex", "Neha, please send the quotation by Friday."),
    android("2:05 pm", "Neha", "I am on it."),
    android("4:01 pm", "Neha", "Quotation sent ✅"),
  ].join("\n");

  const [task] = analyzeConversations(input).actions;
  assert.ok(task);
  assert.equal(task.owner, "Neha");
  assert.equal(task.lifecycleStatus, "completed");
  assert.equal(task.completed, true);
  assert.deepEqual(task.lifecycleEvents.map((event) => event.type), ["acknowledged", "completed"]);
  for (const event of task.lifecycleEvents) {
    assert.ok(input.slice(event.sourceSpan.startOffset, event.sourceSpan.endOffset).includes(event.text));
  }
  assert.ok(task.supportingDetails.some((item) => item.kind === "lifecycle:completed"));
});

test("tracks in-progress updates without changing the assigned owner", () => {
  const input = [
    android("2:01 pm", "Alex", "Neha, please send the quotation by Friday."),
    android("4:01 pm", "Neha", "Working on the quotation now."),
  ].join("\n");
  const [task] = extractActions(input).actions;
  assert.equal(task.owner, "Neha");
  assert.equal(task.lifecycleStatus, "in-progress");
  assert.equal(task.lifecycleEvents[0].type, "in-progress");
});

test("records a delay and updates the resolved due date from the update message timestamp", () => {
  const input = [
    android("2:01 pm", "Alex", "Neha, please send the quotation by Friday."),
    android("4:01 pm", "Neha", "The quotation is delayed until Monday."),
  ].join("\n");
  const [task] = extractActions(input).actions;
  assert.equal(task.lifecycleStatus, "delayed");
  assert.equal(task.dueDate, "Monday");
  assert.equal(task.resolvedDueDate, "2024-10-14");
  assert.equal(task.lifecycleEvents[0].resolvedDueDate, "2024-10-14");
});

test("cancels a unique task and does not mistake 'no need to send it' for a new assignment", () => {
  const input = [
    android("2:01 pm", "Alex", "Neha, please send the quotation by Friday."),
    android("4:01 pm", "Alex", "Client cancelled the quotation request; no need to send it."),
  ].join("\n");
  const actions = extractActions(input).actions;
  assert.equal(actions.length, 1);
  assert.equal(actions[0].lifecycleStatus, "cancelled");
  assert.equal(actions[0].cancelled, true);
  assert.equal(actions[0].lifecycleEvents[0].type, "cancelled");
});

test("reassignment updates the existing task owner instead of creating a second task", () => {
  const input = [
    android("2:01 pm", "Alex", "Neha, please send the quotation by Friday."),
    android("4:01 pm", "Alex", "Reassign the quotation to Rahul."),
  ].join("\n");
  const actions = extractActions(input).actions;
  assert.equal(actions.length, 1);
  assert.equal(actions[0].owner, "Rahul");
  assert.equal(actions[0].lifecycleStatus, "reassigned");
  assert.deepEqual(
    (({ type, previousOwner, newOwner }) => ({ type, previousOwner, newOwner }))(actions[0].lifecycleEvents[0]),
    { type: "reassigned", previousOwner: "Neha", newOwner: "Rahul" },
  );
});

test("does not attach a context-free 'done' to one of several tasks owned by the speaker", () => {
  const input = [
    android("2:01 pm", "Alex", "Neha, please send the quotation by Friday."),
    android("2:02 pm", "Alex", "Neha, please book the hotel by Saturday."),
    android("4:01 pm", "Neha", "Done."),
  ].join("\n");
  const actions = extractActions(input).actions;
  assert.equal(actions.length, 2);
  assert.ok(actions.every((task) => task.lifecycleStatus === "assigned"));
  assert.ok(actions.every((task) => task.lifecycleEvents.length === 0));
});

test("does not mark an explicitly unfinished task as completed", () => {
  const input = [
    android("2:01 pm", "Alex", "Neha, please send the quotation by Friday."),
    android("4:01 pm", "Neha", "The quotation is not done yet."),
  ].join("\n");
  const [task] = extractActions(input).actions;
  assert.equal(task.lifecycleStatus, "assigned");
  assert.equal(task.completed, false);
  assert.equal(task.lifecycleEvents.length, 0);
});

test("preserves lifecycle state and event evidence through the rules-only analysis adapter", async () => {
  const input = [
    android("2:01 pm", "Alex", "Neha, please send the quotation by Friday."),
    android("4:01 pm", "Neha", "Quotation sent ✅"),
  ].join("\n");
  const result = await analyzeTextWithRules(input);
  const [task] = result.actions;
  assert.equal(task.lifecycleStatus, "completed");
  assert.equal(task.completed, true);
  assert.equal(task.lifecycleEvents[0].type, "completed");
  assert.equal(task.lifecycleEvents[0].sourceReferenceStatus, "valid");
  assert.ok(task.lifecycleEvents[0].evidence);
});

test("recognizes a Hinglish completion update and keeps its source evidence", () => {
  const input = [
    android("2:01 pm", "Alex", "Neha, quotation bhej dena by Friday."),
    android("4:01 pm", "Neha", "Quotation bhej diya ✅"),
  ].join("\n");
  const [task] = extractActions(input).actions;
  assert.ok(task);
  assert.equal(task.lifecycleStatus, "completed");
  assert.equal(task.completed, true);
  assert.equal(task.lifecycleEvents[0].type, "completed");
});

test("recognizes named take-over language as a reassignment", () => {
  const input = [
    android("2:01 pm", "Alex", "Neha, please send the quotation by Friday."),
    android("4:01 pm", "Alex", "Rahul will handle the quotation from here."),
  ].join("\n");
  const [task] = extractActions(input).actions;
  assert.equal(task.owner, "Rahul");
  assert.equal(task.lifecycleStatus, "reassigned");
});

test("tracks acknowledgement by the new owner after a reassignment", () => {
  const input = [
    android("2:01 pm", "Alex", "Neha, please send the quotation by Friday."),
    android("3:01 pm", "Alex", "Reassign the quotation to Rahul."),
    android("3:05 pm", "Rahul", "On it."),
  ].join("\n");
  const [task] = extractActions(input).actions;
  assert.equal(task.owner, "Rahul");
  assert.equal(task.lifecycleStatus, "acknowledged");
  assert.deepEqual(task.lifecycleEvents.map((event) => event.type), ["reassigned", "acknowledged"]);
});
