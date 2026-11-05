import test from "node:test";
import assert from "node:assert/strict";
import { analyzeConversations } from "../../src/lib/extraction/index.js";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";

const queue = (body) => analyzeConversations(`[10:00, 02/11/2026] Anita: ${body}`).reviewQueue;

test("prohibitions never enter the possible-task queue (English, Hinglish, Devanagari)", () => {
  for (const body of [
    "Please don't send the report yet.",
    "Please do not send the invoice.",
    "Could you not update the tracker?",
    "Can you not send that to the client?",
    "kindly do not share the file",
    "Please report mat bhejna.",
    "कृपया रिपोर्ट मत भेजना",
    "कृपया इनवॉइस नहीं भेजना",
  ]) assert.equal(queue(body).length, 0, body);
});

test("genuine soft requests still reach the review queue", () => {
  assert.equal(queue("Can you maybe look at the logs sometime").length, 1);
  assert.equal(queue("Don't forget the invoice by Friday").length, 1);
});

test("the review queue survives the engine adapter with validated evidence", async () => {
  const text = "[10:00, 02/11/2026] Anita: Don't forget the invoice by Friday\n[10:01, 02/11/2026] Vik: lunch?";
  const result = await analyzeTextWithRules(text);
  assert.ok(Array.isArray(result.reviewQueue));
  assert.equal(result.reviewQueue.length, 1);
  const [item] = result.reviewQueue;
  assert.equal(item.sourceReferenceStatus, "valid");
  assert.equal(text.slice(item.sourceEvidence.startOffset, item.sourceEvidence.endOffset), item.sourceEvidence.quote);
});
