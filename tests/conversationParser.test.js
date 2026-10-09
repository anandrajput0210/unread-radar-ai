import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeConversations,
  extractActions,
  extractMentions,
  urgencyFor,
} from "../src/lib/conversationParser.js";

test("separates decisions from actionable tasks", () => {
  const result = analyzeConversations(
    [
      "Team: Agreed on submitting the final report tomorrow.",
      "We will revisit this next week.",
    ].join("\n")
  );

  assert.equal(result.actions.length, 0);
  assert.deepEqual(result.decisions, [
    "Team: Agreed on submitting the final report tomorrow.",
  ]);
});

test("does not flag negated boilerplate as a task or urgent message", () => {
  const result = analyzeConversations(
    "No action is required, and this is not urgent."
  );

  assert.equal(result.actions.length, 0);
  assert.equal(result.urgentRows.length, 0);
  assert.equal(result.alerts.length, 0);
  assert.equal(urgencyFor("This is not critical or urgent."), "Low");
});

test("supports Unicode mentions and ignores email addresses", () => {
  const mentions = extractMentions(
    "Mika: @zoë please review café notes by Friday.\n" +
    "Contact dev@example.com."
  );

  assert.deepEqual(
    mentions.map((item) => item.handle),
    ["zoë"]
  );
});

test("does not infer ownership from unrelated mentions or speaker names", () => {
  const result = analyzeConversations(
    [
      "Maya: @anand sent the file earlier. Please review the report.",
      "Ravi: Action item: send the final PDF.",
    ].join("\n")
  );

  assert.equal(result.actions.length, 2);
  assert.equal(result.actions[0].owner, null);
  assert.equal(result.actions[1].owner, null);
});

test("recognizes explicitly addressed action requests", () => {
  const result = extractActions(
    [
      "Maya: @anand please review the report by Friday.",
      "Action: @sam to review the copy tomorrow.",
    ].join("\n")
  );

  assert.equal(result.actions.length, 2);
  assert.equal(result.actions[0].owner, "@anand");
  assert.equal(result.actions[1].owner, "@sam");
});

test("correctly extracts signals from the baseline conversation", () => {
  const input = [
    "INTRODUCTION TO ELECTRICAL ENGINEERING",
    "Maya: @anand please review the report by Friday.",
    "Ravi: Action item: send the final PDF by 5pm today.",
    "Ops: Critical outage is blocking checkout. Investigate ASAP.",
    "Team: Agreed on submitting the final report tomorrow.",
  ].join("\n");

  const result = analyzeConversations(input);

  assert.equal(result.lineCount, 5);
  assert.equal(result.actions.length, 3);
  assert.equal(result.decisions.length, 1);
  assert.deepEqual(
    result.mentions.map((item) => item.handle),
    ["anand"]
  );
  assert.equal(result.deadlines.length, 3);
  assert.equal(result.urgentRows.length, 1);
  assert.equal(result.alerts.length, 7);
});

test("returns a stable result for empty or non-string input", () => {
  for (const input of ["", "   \n  ", null, undefined, 42]) {
    const result = analyzeConversations(input);

    assert.deepEqual(result.actions, []);
    assert.deepEqual(result.decisions, []);
    assert.deepEqual(result.deadlines, []);
    assert.deepEqual(result.mentions, []);
    assert.equal(result.lineCount, 0);
  }
});

test("deduplicates repeated action and deadline records", () => {
  const result = analyzeConversations(
    [
      "Sam: Action item: send report by Friday.",
      "Sam: Action item: send report by Friday.",
    ].join("\n")
  );

  assert.equal(result.actions.length, 1);
  assert.equal(result.deadlines.length, 1);
});