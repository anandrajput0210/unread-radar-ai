import test from "node:test";
import assert from "node:assert/strict";
import { analyzeConversations } from "../src/lib/conversationParser.js";
import { buildSourceGroundedSummary } from "../src/lib/sourceGroundedSummary.js";

test("source-grounded summary preserves speaker and addressee instead of paraphrasing", () => {
  const chat = [
    "[17/10/2026, 09:08] Priya: @Meera please test the fix after Anand finishes.",
    "[17/10/2026, 09:06] Meera: Decision: We will keep user data on the device.",
    "[17/10/2026, 09:05] Rahul: Urgent: the production API is returning errors.",
  ].join("\n");

  const sourceFindings = analyzeConversations(chat);
  const summary = buildSourceGroundedSummary(sourceFindings);

  assert.ok(summary.some((line) => line.includes("Priya: @Meera please test the fix after Anand finishes.")));
  assert.ok(summary.some((line) => line.includes("Meera: Decision: We will keep user data on the device.")));
  assert.ok(summary.some((line) => line.includes("Rahul: Urgent: the production API is returning errors.")));
  assert.equal(summary.some((line) => /Rahul requests Priya to test/i.test(line)), false);
});

test("source-grounded summary handles an empty finding set", () => {
  const summary = buildSourceGroundedSummary({
    actions: [], decisions: [], deadlines: [], mentions: [], urgentRows: [],
  });
  assert.equal(summary.length, 2);
  assert.match(summary[0], /No clear action/);
});

test("uses exact source slices for summary excerpts and keeps semantic status unverified", async () => {
  const { createSourceSnapshot } = await import("../src/lib/sourceSnapshot.js");
  const rawText = "  Priya: Action item: send the report.  ";
  const snapshot = await createSourceSnapshot(rawText);
  const rules = analyzeConversations(rawText);
  const summary = buildSourceGroundedSummary(rules, snapshot);
  assert.ok(summary.some((line) => line.includes(`“${rawText}”`)));
  assert.match(summary[0], /rule-detected action candidate/i);
});
