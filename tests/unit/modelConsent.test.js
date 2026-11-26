import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTextByMode } from "../../src/lib/ai/localAiEngine.js";
import { MODEL_CONFIRMATION_TEXT, selectAnalysisMode } from "../../src/lib/ai/modelConsent.js";

const CHAT = "[10:00, 26/11/2026] Mina: Please review the release notes.";

test("rules-only mode never calls the optional model loader", async () => {
  let loaderCalls = 0;
  const execution = await analyzeTextByMode(
    CHAT,
    selectAnalysisMode(false, () => {
      throw new Error("rules-only must not ask for model confirmation");
    }),
    () => {},
    { modelLoaderOverride: async () => { loaderCalls += 1; } },
  );

  assert.equal(execution.mode, "rules-only");
  assert.equal(execution.analysis.analysisMode, "rules-only");
  assert.equal(loaderCalls, 0);
});

test("cancelling Qwen confirmation selects rules-only without calling the model loader", async () => {
  let confirmationText;
  let loaderCalls = 0;
  const selectedMode = selectAnalysisMode(true, (message) => {
    confirmationText = message;
    return false;
  });
  const execution = await analyzeTextByMode(
    CHAT,
    selectedMode,
    () => {},
    { modelLoaderOverride: async () => { loaderCalls += 1; } },
  );

  assert.equal(confirmationText, MODEL_CONFIRMATION_TEXT);
  assert.match(confirmationText, /compatible WebGPU hardware/u);
  assert.match(confirmationText, /downloads large model files/u);
  assert.match(confirmationText, /may slow or freeze low-memory machines/u);
  assert.equal(selectedMode, "rules-only");
  assert.equal(execution.mode, "rules-only");
  assert.equal(execution.fallbackReason, null);
  assert.equal(execution.analysis.analysisMode, "rules-only");
  assert.equal(loaderCalls, 0);
});
