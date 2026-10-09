import test from "node:test";
import assert from "node:assert/strict";
import { combineAnalysisChunks, createEmptyAnalysis, normalizeModelChunk } from "../src/lib/analysisSchema.js";

test("empty analysis has a stable shape", () => {
  assert.deepEqual(createEmptyAnalysis(), {
    summary: [], actions: [], decisions: [], deadlines: [], mentions: [], urgentRows: [], alerts: [], lineCount: 0, sourceChunks: 0, modelId: "",
  });
});

test("normalizes local model output without guessing missing owners", () => {
  const result = normalizeModelChunk({
    summary: ["A report is due Friday."],
    actions: [{ text: "Review the report", owner: "", dueDate: "Friday", urgency: "Medium", evidence: "Please review the report by Friday", confidence: 0.88 }],
    decisions: ["The group agreed to keep the current plan."],
    deadlines: [{ text: "Please review the report by Friday", dates: ["Friday"], urgency: "Medium", confidence: 0.91 }],
    mentions: [{ handle: "@zoë", line: "@zoë please review the report.", urgency: "Medium", confidence: 0.86 }],
    urgentRows: [],
  });
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].owner, null);
  assert.equal(result.actions[0].dueDate, "Friday");
  assert.equal(result.mentions[0].handle, "zoë");
  assert.equal(result.deadlines[0].dates[0], "Friday");
});

test("combines chunks and de-duplicates overlapping source findings", () => {
  const a = normalizeModelChunk({
    summary: ["A critical incident is affecting checkout."],
    actions: [{ text: "Roll back the release", owner: "@ops", dueDate: "now", urgency: "High", evidence: "@ops please roll back the release now", confidence: 0.9 }],
    decisions: [], deadlines: [], mentions: [{ handle: "ops", line: "@ops please roll back the release now", urgency: "High", confidence: 0.93 }],
    urgentRows: [{ text: "A critical incident is affecting checkout.", reason: "Service impact", confidence: 0.94 }],
  }, 0);
  const b = normalizeModelChunk({
    summary: ["A critical incident is affecting checkout."],
    actions: [{ text: "Roll back the release", owner: "@ops", dueDate: "now", urgency: "High", evidence: "@ops please roll back the release now", confidence: 0.9 }],
    decisions: ["Rollback was agreed."], deadlines: [], mentions: [{ handle: "ops", line: "@ops please roll back the release now", urgency: "High", confidence: 0.93 }],
    urgentRows: [{ text: "A critical incident is affecting checkout.", reason: "Service impact", confidence: 0.94 }],
  }, 1);
  const merged = combineAnalysisChunks("@ops please roll back the release now\nA critical incident is affecting checkout.", [a, b], "unit-test-model");
  assert.equal(merged.actions.length, 1);
  assert.equal(merged.mentions.length, 1);
  assert.equal(merged.urgentRows.length, 1);
  assert.equal(merged.summary.length, 1);
  assert.equal(merged.lineCount, 2);
  assert.equal(merged.modelId, "unit-test-model");
});

test("rejects malformed model payloads", () => {
  assert.throws(() => normalizeModelChunk("not json"), /invalid JSON/);
  assert.throws(() => normalizeModelChunk(null), /unexpected response shape/);
});

test("keeps alert records unique by category and text", () => {
  const chunk = normalizeModelChunk({
    summary: [],
    actions: [{ text: "Send the report", owner: "", dueDate: "", urgency: "Low", evidence: "Send the report", confidence: 0.7 }],
    decisions: [],
    deadlines: [{ text: "Send the report", dates: ["today"], urgency: "Low", confidence: 0.7 }],
    mentions: [], urgentRows: [],
  });
  const merged = combineAnalysisChunks("Send the report", [chunk]);
  assert.equal(merged.alerts.length, 2);
  assert.deepEqual(new Set(merged.alerts.map((item) => item.kind)), new Set(["Action item", "Deadline"]));
});
