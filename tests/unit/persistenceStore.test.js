import test from "node:test";
import assert from "node:assert/strict";
import {
  SCHEMA_VERSION,
  clearAll,
  fingerprint,
  listSessions,
  loadSession,
  persistIfEnabled,
  restoreSession,
  saveSession,
} from "../../src/lib/persistence/store.js";

function fakeStorage({ onSetItem } = {}) {
  const values = new Map();
  const calls = { get: 0, set: 0, remove: 0, key: 0, length: 0 };
  return {
    values,
    calls,
    get length() {
      calls.length += 1;
      return values.size;
    },
    key(index) {
      calls.key += 1;
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      calls.get += 1;
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      calls.set += 1;
      onSetItem?.(key, value);
      values.set(key, String(value));
    },
    removeItem(key) {
      calls.remove += 1;
      values.delete(key);
    },
  };
}

function record(text, overrides = {}) {
  return {
    fingerprint: fingerprint(text),
    savedAt: "2026-11-25T12:00:00.000Z",
    schemaVersion: SCHEMA_VERSION,
    analysis: { actions: [{ id: "task-1", text: "Send the report" }] },
    reviewDecisions: { "candidate-1": { decision: "rejected" } },
    taskStatuses: { "task-1": "completed" },
    selectedIdentity: "Alex",
    sourceMessageFingerprints: ["message-hash-1"],
    ...overrides,
  };
}

test("fingerprint is stable across normalized line endings and Unicode forms", () => {
  assert.equal(fingerprint("first\r\nsecond"), fingerprint("first\nsecond"));
  assert.equal(fingerprint("café"), fingerprint("cafe\u0301"));
  assert.equal(fingerprint("same chat"), fingerprint("same chat"));
});

test("loadSession never returns another chat's saved data", () => {
  const storage = fakeStorage();
  const saved = record("chat A");
  assert.equal(saveSession(storage, saved).saved, true);

  assert.equal(loadSession(storage, fingerprint("chat B")), null);
  assert.equal(loadSession(storage, saved.fingerprint).analysis.actions[0].text, "Send the report");
});

test("persistence disabled does not call saveSession or touch storage", () => {
  const storage = fakeStorage();
  let saveCalls = 0;
  const result = persistIfEnabled(storage, false, record("private chat"), () => {
    saveCalls += 1;
    return saveSession(storage, record("private chat"));
  });

  assert.equal(result.status, "disabled");
  assert.equal(saveCalls, 0);
  assert.equal(storage.values.size, 0);
  assert.deepEqual(storage.calls, { get: 0, set: 0, remove: 0, key: 0, length: 0 });
});

test("unknown and older schema versions are ignored without migration", () => {
  for (const schemaVersion of [0, 999]) {
    const storage = fakeStorage();
    const saved = record(`schema-${schemaVersion}`);
    assert.equal(saveSession(storage, saved).saved, true);
    const [key] = storage.values.keys();
    storage.values.set(key, JSON.stringify({ ...saved, schemaVersion }));

    assert.equal(loadSession(storage, saved.fingerprint), null);
    assert.equal(listSessions(storage).length, 0);
  }
});

test("corrupted JSON is ignored without throwing", () => {
  const storage = fakeStorage();
  const saved = record("corrupted chat");
  assert.equal(saveSession(storage, saved).saved, true);
  const [key] = storage.values.keys();
  storage.values.set(key, "{not-json");

  assert.doesNotThrow(() => assert.equal(loadSession(storage, saved.fingerprint), null));
  assert.equal(listSessions(storage).length, 0);
});

test("clearAll removes feature-owned keys but preserves unrelated storage", () => {
  const storage = fakeStorage();
  const first = record("first");
  const second = record("second");
  assert.equal(saveSession(storage, first).saved, true);
  assert.equal(saveSession(storage, second).saved, true);
  storage.setItem("unrelated:preference", "keep");

  const result = clearAll(storage);

  assert.equal(result.success, true);
  assert.equal(result.cleared, 2);
  assert.deepEqual([...storage.values.entries()], [["unrelated:preference", "keep"]]);
});

test("restore drops a selected identity that is not present in the loaded chat", () => {
  const storage = fakeStorage();
  const saved = record("identity chat");
  assert.equal(saveSession(storage, saved).saved, true);

  const restored = restoreSession(storage, saved.fingerprint, ["Morgan", "Pat"]);

  assert.ok(restored);
  assert.equal(restored.selectedIdentity, null);
  assert.deepEqual(restored.analysis.actions.map((action) => action.text), ["Send the report"]);
});

test("saved records retain source identifiers without storing raw chat text", () => {
  const storage = fakeStorage();
  const saved = record("private source", {
    rawText: "private source",
    sourceSnapshotId: "sha256:snapshot-id",
    sourceMessageRanges: [{ startOffset: 0, endOffset: 12 }],
  });

  assert.equal(saveSession(storage, saved).saved, true);
  const stored = JSON.parse([...storage.values.values()][0]);

  assert.equal(stored.sourceSnapshotId, "sha256:snapshot-id");
  assert.deepEqual(stored.sourceMessageRanges, [{ startOffset: 0, endOffset: 12 }]);
  assert.equal(Object.hasOwn(stored, "rawText"), false);
  assert.equal(JSON.stringify(stored).includes("private source"), false);
});

test("quota failure returns not-saved instead of throwing", () => {
  const storage = fakeStorage({
    onSetItem() {
      const error = new Error("quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    },
  });

  let result;
  assert.doesNotThrow(() => { result = saveSession(storage, record("quota chat")); });
  assert.equal(result.saved, false);
  assert.equal(result.status, "not-saved");
  assert.match(result.message, /not saved/i);
  assert.equal(storage.values.size, 0);
});

test("saved sessions are capped at five and oldest are dropped", () => {
  const storage = fakeStorage();
  for (let index = 0; index < 6; index += 1) {
    const saved = record(`chat-${index}`, {
      savedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    });
    assert.equal(saveSession(storage, saved).saved, true);
  }

  const sessions = listSessions(storage);
  assert.equal(sessions.length, 5);
  assert.equal(loadSession(storage, fingerprint("chat-0")), null);
  assert.ok(loadSession(storage, fingerprint("chat-5")));
});

test("a record over the size limit is not stored", () => {
  const storage = fakeStorage();
  const result = saveSession(storage, record("large chat", {
    analysis: { text: "x".repeat(1024 * 1024) },
  }));

  assert.equal(result.status, "not-saved");
  assert.equal(result.reason, "too-large");
  assert.equal(storage.values.size, 0);
});
