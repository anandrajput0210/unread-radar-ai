import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  checkLocalModelSupport,
  checkWebGPUCompatibility,
  analyzeTextByMode,
  invalidateAnalysisWork,
  MODEL_ID,
} from "../../src/lib/ai/localAiEngine.js";

test("checks adapter availability without importing WebLLM or downloading model assets", async () => {
  assert.equal((await checkWebGPUCompatibility(null)).supported, false);
  assert.equal((await checkWebGPUCompatibility({ requestAdapter: async () => null })).supported, false);
  assert.equal((await checkWebGPUCompatibility({ requestAdapter: async () => { throw new Error("blocked"); } })).supported, false);

  let destroyed = false;
  const supported = await checkWebGPUCompatibility({
    requestAdapter: async () => ({
      requestDevice: async () => ({ destroy() { destroyed = true; } }),
    }),
  });
  assert.equal(supported.supported, true);
  assert.equal(destroyed, true);
});

test("requires the WebGPU adapter API in the synchronous support check", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { gpu: {} } });
    assert.equal(checkLocalModelSupport().supported, false);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { gpu: { requestAdapter() {} } } });
    assert.equal(checkLocalModelSupport().supported, true);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
    if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
    else delete globalThis.location;
  }
});

test("the locked WebLLM version and selected model remain the existing Phase 1 contract", async () => {
  const lock = JSON.parse(await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"));
  assert.equal(lock.packages["node_modules/@mlc-ai/web-llm"].version, "0.2.85");
  assert.equal(MODEL_ID, "Qwen2.5-0.5B-Instruct-q4f16_1-MLC");
});


test("rules-only is the default and does not touch WebGPU", async () => {
  let adapterRequests = 0;
  const gpu = {
    async requestAdapter() {
      adapterRequests += 1;
      throw new Error("rules-only mode must not request an adapter");
    },
  };
  const execution = await analyzeTextByMode(
    "[10:00, 02/11/2026] Sam: Please send the final report by Friday.",
    undefined,
    () => {},
    { gpu },
  );

  assert.equal(execution.mode, "rules-only");
  assert.equal(execution.fallbackReason, null);
  assert.equal(execution.analysis.analysisMode, "rules-only");
  assert.equal(execution.analysis.actions.length, 1);
  assert.equal(adapterRequests, 0);
});

test("the opted-in model mode checks WebGPU and falls back to rules-only when unavailable", async () => {
  const execution = await analyzeTextByMode(
    "[10:00, 02/11/2026] Sam: Please send the final report by Friday.",
    "local-model",
    () => {},
    { gpu: null },
  );

  assert.equal(execution.mode, "rules-only");
  assert.match(execution.fallbackReason, /WebGPU adapter API is unavailable/);
  assert.equal(execution.analysis.analysisMode, "rules-only");
  assert.equal(execution.analysis.actions.length, 1);
});

test("the explicitly selected model mode reaches inference only after WebGPU compatibility succeeds", async () => {
  let adapterRequests = 0;
  let inferenceCalls = 0;
  const gpu = {
    async requestAdapter() {
      adapterRequests += 1;
      return { requestDevice: async () => ({ destroy() {} }) };
    },
  };
  const inferenceEngineOverride = {
    chat: {
      completions: {
        async create() {
          inferenceCalls += 1;
          return {
            choices: [{ message: { content: JSON.stringify({
              summary: ["A report review was requested."],
              actions: [],
              decisions: [],
              deadlines: [],
              mentions: [],
              urgentRows: [],
            }) } }],
          };
        },
      },
    },
  };

  const execution = await analyzeTextByMode(
    "Maya: Please review the report.",
    "local-model",
    () => {},
    { gpu, forceFresh: true, inferenceEngineOverride },
  );

  assert.equal(adapterRequests, 1);
  assert.equal(inferenceCalls, 1);
  assert.equal(execution.mode, "local-model");
  assert.equal(execution.fallbackReason, null);
  assert.equal(execution.analysis.modelExecution.status, "completed");
});

test("model inference failures fall back to rules-only with a meaningful reason", async () => {
  const gpu = {
    async requestAdapter() {
      return { requestDevice: async () => ({ destroy() {} }) };
    },
  };
  const inferenceEngineOverride = {
    chat: { completions: { async create() { throw new Error("model download or inference network failed"); } } },
  };
  const execution = await analyzeTextByMode(
    "Maya: Please review the report.",
    "local-model",
    () => {},
    { gpu, forceFresh: true, inferenceEngineOverride },
  );
  assert.equal(execution.mode, "rules-only");
  assert.match(execution.fallbackReason, /Local AI failed; rules-only analysis was used/);
  assert.match(execution.fallbackReason, /model download or inference network failed/);
  assert.equal(execution.analysis.analysisMode, "rules-only");
  assert.equal(execution.analysis.actions.length, 1);
});

test("model initialization failures return preserved deterministic findings as rules-only", async () => {
  const gpu = {
    async requestAdapter() {
      return { requestDevice: async () => ({ destroy() {} }) };
    },
  };
  const execution = await analyzeTextByMode(
    "Maya: Please review the report.",
    "local-model",
    () => {},
    {
      gpu,
      forceFresh: true,
      modelLoaderOverride: async () => { throw new Error("model initialization failed"); },
    },
  );
  assert.equal(execution.mode, "rules-only");
  assert.match(execution.fallbackReason, /model initialization failed/);
  assert.equal(execution.analysis.analysisMode, "rules-only");
  assert.equal(execution.analysis.actions.length, 1);
  assert.equal(execution.analysis.actions[0].sourceReferenceStatus, "valid");
  assert.equal(execution.analysis.modelExecution, undefined);
});

test("invalid model JSON falls back to rules-only instead of claiming AI success", async () => {
  const gpu = {
    async requestAdapter() {
      return { requestDevice: async () => ({ destroy() {} }) };
    },
  };
  const inferenceEngineOverride = {
    chat: { completions: { async create() { return { choices: [{ message: { content: "not JSON" } }] }; } } },
  };
  const execution = await analyzeTextByMode(
    "Maya: Please review the report.",
    "local-model",
    () => {},
    { gpu, forceFresh: true, inferenceEngineOverride },
  );
  assert.equal(execution.mode, "rules-only");
  assert.match(execution.fallbackReason, /not valid JSON/);
  assert.equal(execution.analysis.modelExecution, undefined);
  assert.equal(execution.analysis.actions.length, 1, "the deterministic finding is retained");
});

test("cancelled or invalidated model analysis is not reported as a successful rules fallback", async () => {
  const gpu = {
    async requestAdapter() {
      return { requestDevice: async () => ({ destroy() {} }) };
    },
  };
  await assert.rejects(
    analyzeTextByMode(
      "Maya: Please review the report.",
      "local-model",
      () => {},
      {
        gpu,
        forceFresh: true,
        modelLoaderOverride: async () => {
          const error = new Error("The user cancelled model loading.");
          error.name = "AbortError";
          throw error;
        },
      },
    ),
    (error) => error.name === "AbortError",
  );

  const invalidatingEngine = {
    chat: {
      completions: {
        async create() {
          invalidateAnalysisWork();
          return {
            choices: [{ message: { content: JSON.stringify({
              summary: [],
              actions: [],
              decisions: [],
              deadlines: [],
              mentions: [],
              urgentRows: [],
            }) } }],
          };
        },
      },
    },
  };
  await assert.rejects(
    analyzeTextByMode(
      "Maya: Please review the report.",
      "local-model",
      () => {},
      { gpu, forceFresh: true, inferenceEngineOverride: invalidatingEngine },
    ),
    /Analysis was invalidated/,
  );
});

test("generic runtime failure after invalidation rejects instead of falling back on stale input", async () => {
  const gpu = {
    async requestAdapter() {
      return { requestDevice: async () => ({ destroy() {} }) };
    },
  };
  let inferenceStarted = false;
  const invalidatingEngine = {
    chat: {
      completions: {
        async create() {
          inferenceStarted = true;
          invalidateAnalysisWork();
          throw new Error("generic model runtime failure");
        },
      },
    },
  };
  await assert.rejects(
    analyzeTextByMode(
      "Maya: Please review the report.",
      "local-model",
      () => {},
      { gpu, forceFresh: true, inferenceEngineOverride: invalidatingEngine },
    ),
    /generic model runtime failure/,
  );
  assert.equal(inferenceStarted, true);
});

test("unknown analysis modes fail closed", async () => {
  await assert.rejects(
    analyzeTextByMode("Please send the report.", "automatic-model"),
    /Unsupported analysis mode/,
  );
});
