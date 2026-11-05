import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSourceSnapshot } from "../../src/lib/import/sourceSnapshot.js";
import { validateEvidenceReference } from "../../src/lib/validation/evidenceValidation.js";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";

const fixtures = [
  "accuracy-chat-1-product-launch.txt",
  "accuracy-chat-2-incident-response.txt",
  "accuracy-chat-3-meeting-followups.txt",
];

for (const fixtureName of fixtures) {
  test(`${fixtureName}: every task, acknowledgement and supporting detail has a valid exact source reference`, async () => {
    const rawText = await readFile(new URL(`../fixtures/${fixtureName}`, import.meta.url), "utf8");
    const snapshot = await createSourceSnapshot(rawText);
    const result = await analyzeTextWithRules(rawText, { sourceSnapshot: snapshot });

    assert.ok(result.actions.length > 0);
    for (const action of result.actions) {
      assert.equal(action.sourceReferenceStatus, "valid", `Invalid task evidence: ${action.text}`);
      assert.ok(validateEvidenceReference(snapshot, action.sourceEvidence).valid, `Invalid primary evidence: ${action.text}`);

      if (action.acknowledgementEvidence) {
        assert.equal(action.acknowledgementReferenceStatus, "valid");
        assert.ok(validateEvidenceReference(snapshot, action.acknowledgementEvidence).valid);
      }

      for (const detail of action.supportingEvidence || []) {
        assert.equal(detail.sourceReferenceStatus, "valid", `Invalid supporting evidence: ${detail.text}`);
        assert.ok(validateEvidenceReference(snapshot, detail.evidence).valid);
      }
    }
  });
}
