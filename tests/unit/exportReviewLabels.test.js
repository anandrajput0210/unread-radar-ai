import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyAnalysis } from "../../src/lib/ai/analysisSchema.js";
import { buildCopySummary, buildExecutiveBrief } from "../../src/lib/export/report.js";

function possibleAnalysis() {
  const analysis = createEmptyAnalysis();
  analysis.actions = [{
    id: "accepted-possible",
    text: "Review the draft",
    owner: null,
    outcome: "possible",
    outcomeReason: "Suggestion, not a direct request",
    urgency: "Low",
    lifecycleEvents: [],
    sourceReferenceStatus: "missing",
  }];
  return analysis;
}

test("exports keep possible extraction outcome separate from accepted human review", () => {
  const analysis = possibleAnalysis();
  const taskStatuses = { "accepted-possible": "confirmed" };
  const executive = buildExecutiveBrief({ analysis, taskStatuses });
  const copy = buildCopySummary({ analysis, taskStatuses });

  assert.match(executive, /Possible extraction outcomes:\*\* 1/u);
  assert.match(executive, /Possible candidate|possible/u);
  assert.match(executive, /Confirmed by you/u);
  assert.doesNotMatch(executive, /Possible task — review|unconfirmed tasks|Confirm or reject/u);
  assert.match(copy, /POSSIBLE extraction outcome/u);
  assert.match(copy, /Confirmed by you/u);
  assert.doesNotMatch(copy, /POSSIBLE — review/u);
});

test("promoted export remains accepted even without a task-status entry", () => {
  const analysis = possibleAnalysis();
  analysis.actions[0].humanReviewStatus = "promoted";
  const executive = buildExecutiveBrief({ analysis, taskStatuses: {} });

  assert.match(executive, /Promoted by you/u);
  assert.match(executive, /Extractor outcome: possible/u);
  assert.doesNotMatch(executive, /Needs human review|review needed/u);
});
