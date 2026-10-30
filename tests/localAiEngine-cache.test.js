import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeTextWithRules,
  clearLegacySessionCache,
  invalidateAnalysisWork,
  isAnalysisGenerationCurrent,
} from "../src/lib/localAiEngine.js";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    has(key) { return values.has(key); },
  };
}

test("removes only the application-owned legacy cache key and preserves unrelated storage", () => {
  const storage = createMemoryStorage({
    "unread-radar-ai:analysis-results:v2": "old-results",
    "unrelated-preference": "keep-me",
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: storage },
  });

  const result = clearLegacySessionCache();
  assert.deepEqual(result, { success: true, removed: true });
  assert.equal(storage.has("unread-radar-ai:analysis-results:v2"), false);
  assert.equal(storage.getItem("unrelated-preference"), "keep-me");
  assert.deepEqual(clearLegacySessionCache(), { success: true, removed: false });
});

test("reports access/removal errors instead of claiming legacy cleanup succeeded", () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      get sessionStorage() { throw new Error("storage blocked"); },
    },
  });
  const result = clearLegacySessionCache();
  assert.equal(result.success, false);
  assert.match(result.error, /storage blocked/);
});

test("invalidating analysis advances the generation token and prevents old work being current", () => {
  const oldGeneration = invalidateAnalysisWork();
  assert.equal(isAnalysisGenerationCurrent(oldGeneration), true);
  const newGeneration = invalidateAnalysisWork();
  assert.equal(newGeneration, oldGeneration + 1);
  assert.equal(isAnalysisGenerationCurrent(oldGeneration), false);
  assert.equal(isAnalysisGenerationCurrent(newGeneration), true);
});

test("rules-only fallback creates exact evidence references without touching sessionStorage", async () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { get sessionStorage() { throw new Error("must not access storage"); } },
  });
  const rawText = "Please send the final report by Friday.";
  const result = await analyzeTextWithRules(rawText);
  assert.equal(result.analysisMode, "rules-only");
  assert.equal(result.modelId, "rules-only");
  assert.equal(result.sourceBoundaryMode, "opaque");
  assert.equal(result.sourceMessageCount, 1);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].sourceReferenceStatus, "valid");
  assert.equal(result.actions[0].semanticStatus, "unverified");
  assert.equal(result.actions[0].sourceEvidence.quote, rawText);
});

test("rules-only fallback discloses opaque source granularity and keeps author unknown", async () => {
  const rawText = "Maya: Please review the report.\nThis line has no recognizable speaker header.";
  const result = await analyzeTextWithRules(rawText);
  assert.equal(result.sourceBoundaryMode, "opaque");
  assert.equal(result.messageGranularity, "single-source-message");
  assert.equal(result.actions[0].sourceEvidence.quote, "Maya: Please review the report.");
  assert.equal(result.actions[0].sourceEvidence.snapshotId, result.sourceSnapshotId);
});
