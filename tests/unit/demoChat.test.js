import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTextByMode } from "../../src/lib/ai/localAiEngine.js";
import { DEMO_CHAT } from "../../src/lib/demoChat.js";

test("the curated demo covers clear English, Hinglish, ambiguous, and disputed ownership", async () => {
  let modelLoaderCalls = 0;
  const execution = await analyzeTextByMode(DEMO_CHAT, "rules-only", () => {}, {
    modelLoaderOverride: async () => {
      modelLoaderCalls += 1;
      throw new Error("The demo must not load a model.");
    },
  });
  const actions = execution.analysis.actions;
  const task = (phrase) => actions.find((action) => action.text.includes(phrase));

  assert.equal(execution.mode, "rules-only");
  assert.equal(modelLoaderCalls, 0);
  assert.equal(task("launch notes")?.owner, "Dev Patel");
  assert.equal(task("kal tak invoice")?.owner, "Rohan");
  assert.equal(task("project tracker")?.owner, null);
  assert.equal(task("project tracker")?.ownerBasis, "ambiguous");
  assert.equal(task("vendor quotation")?.owner, null);
  assert.equal(task("vendor quotation")?.ownerBasis, "disputed");
});
