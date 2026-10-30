import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  checkLocalModelSupport,
  checkWebGPUCompatibility,
  MODEL_ID,
} from "../src/lib/localAiEngine.js";

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
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(lock.packages["node_modules/@mlc-ai/web-llm"].version, "0.2.85");
  assert.equal(MODEL_ID, "Qwen2.5-0.5B-Instruct-q4f16_1-MLC");
});
