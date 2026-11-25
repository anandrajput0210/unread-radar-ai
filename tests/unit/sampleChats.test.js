import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";
import { SAMPLE_CHATS } from "../../src/lib/sampleChats.js";

test("English sample produces one acknowledged, source-grounded assigned task", async () => {
  const result = await analyzeTextWithRules(SAMPLE_CHATS.english);
  assert.equal(result.actions.length, 1);
  assert.match(result.actions[0].text, /executive deck.*Friday 5 PM/i);
  assert.equal(result.actions[0].owner, "Maria");
  assert.equal(result.actions[0].lifecycleStatus, "acknowledged");
  assert.equal(result.actions[0].sourceReferenceStatus, "valid");
  assert.match(result.actions[0].sourceEvidence.quote, /Maria, please update the executive deck/);
});

test("Hinglish sample produces one acknowledged task with speaker-grounded owner and timing phrase", async () => {
  const result = await analyzeTextWithRules(SAMPLE_CHATS.hinglish);
  assert.equal(result.actions.length, 1);
  assert.match(result.actions[0].text, /GST invoice/i);
  assert.equal(result.actions[0].owner, "Vikram");
  assert.equal(result.actions[0].dueDate, "kal tak");
  assert.equal(result.actions[0].lifecycleStatus, "acknowledged");
  assert.equal(result.actions[0].sourceReferenceStatus, "valid");
  assert.match(result.actions[0].sourceEvidence.quote, /Vikram bhai, kal tak/);
});
