import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTextLocally, MODEL_ID } from "../src/lib/localAiEngine.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
}

test("reuses a session-cached result for the same exact conversation without loading WebGPU", async () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: { sessionStorage: createMemoryStorage() },
  });

  const input = "Priya: @Anand please fix the login bug by 5 PM today.";
  const keyBytes = new TextEncoder().encode(`${MODEL_ID}\n${input.trim()}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", keyBytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const expected = {
    summary: ["Cached result for test"],
    actions: [],
    decisions: [],
    deadlines: [],
    mentions: [],
    urgentRows: [],
    alerts: [],
    sourceChunks: 1,
    modelId: MODEL_ID,
  };

  window.sessionStorage.setItem(
    "unread-radar-ai:analysis-results:v2",
    JSON.stringify({ version: 2, entries: [[hash, expected]] }),
  );

  const progressEvents = [];
  const actual = await analyzeTextLocally(input, (event) => progressEvents.push(event));

  assert.deepEqual(actual, expected);
  assert.equal(progressEvents.some((event) => event.cached === true), true);
  assert.match(progressEvents.at(-1).message, /session-cached results/i);
});
