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
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";
import { createSourceSnapshot } from "../../src/lib/import/sourceSnapshot.js";
import { SAMPLE_CHATS } from "../../src/lib/sampleChats.js";
import { TRAP_CHATS } from "../../src/lib/trapChats.js";

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
    analysis: {
      summary: [],
      actions: [{
        id: "task-1",
        text: "Send the report",
        owner: null,
        outcome: "confirmed",
        urgency: "Low",
        lifecycleEvents: [],
        sourceEvidence: null,
        sourceReferenceStatus: "missing",
      }],
      reviewQueue: [],
      decisions: [],
      deadlines: [],
      mentions: [],
      urgentRows: [],
      alerts: [],
      lineCount: 1,
      sourceChunks: 1,
      modelId: "",
    },
    reviewDecisions: { "candidate-1": { decision: "rejected", reviewedAt: "2026-11-25T12:00:00.000Z" } },
    taskStatuses: { "task-1": "completed" },
    selectedIdentity: "Alex",
    sourceMessageFingerprints: [fingerprint("source message")],
    sourceSnapshotId: `sha256:${"a".repeat(64)}`,
    sourceMessageRanges: [{ startOffset: 0, endOffset: 14 }],
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    snapshotId: `sha256:${"a".repeat(64)}`,
    messageId: `sha256:${"d".repeat(64)}`,
    startOffset: 0,
    endOffset: 14,
    quote: "Source message",
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

test("a real rules-only analysis with source metadata remains restorable", async () => {
  const text = SAMPLE_CHATS.english;
  const snapshot = await createSourceSnapshot(text);
  const analysis = await analyzeTextWithRules(text, { sourceSnapshot: snapshot });
  const messageFingerprints = snapshot.messages.map((message) => fingerprint(JSON.stringify([
    message.authorRaw || "",
    message.timestampRaw || "",
    (message.rawText || "").replace(/(?:\r\n|\r|\n)+$/u, ""),
  ])));
  const storage = fakeStorage();
  const saved = record(text, {
    fingerprint: fingerprint(text),
    analysis,
    sourceSnapshotId: snapshot.snapshotId,
    sourceMessageFingerprints: messageFingerprints,
    sourceMessageRanges: snapshot.messages.map(({ startOffset, endOffset }) => ({ startOffset, endOffset })),
  });

  assert.equal(saveSession(storage, saved).saved, true);
  assert.equal(loadSession(storage, saved.fingerprint).analysis.actions[0].text, analysis.actions[0].text);
});

test("ambiguous owner candidate name survives validated persistence", async () => {
  const text = TRAP_CHATS["same-first-name"];
  const snapshot = await createSourceSnapshot(text);
  const analysis = await analyzeTextWithRules(text, { sourceSnapshot: snapshot });
  const sourceMessageFingerprints = snapshot.messages.map((message) => fingerprint(JSON.stringify([
    message.authorRaw || "",
    message.timestampRaw || "",
    (message.rawText || "").replace(/(?:\r\n|\r|\n)+$/u, ""),
  ])));
  const saved = record(text, {
    fingerprint: fingerprint(text),
    analysis,
    sourceSnapshotId: snapshot.snapshotId,
    sourceMessageFingerprints,
    sourceMessageRanges: snapshot.messages.map(({ startOffset, endOffset }) => ({ startOffset, endOffset })),
  });
  const storage = fakeStorage();

  assert.equal(saveSession(storage, saved).saved, true);
  const restored = loadSession(storage, saved.fingerprint);
  const task = restored.analysis.actions.find((item) => item.text.includes("draft invoice"));
  assert.equal(task?.ownerCandidateName, "Ravi");
  assert.equal(task?.owner, null);

  const invalidStorage = fakeStorage();
  const invalidAnalysis = JSON.parse(JSON.stringify(analysis));
  const invalidTask = invalidAnalysis.actions.find((item) => item.text.includes("draft invoice"));
  invalidTask.ownerCandidateName = 7;
  assert.equal(saveSession(invalidStorage, { ...saved, analysis: invalidAnalysis }).reason, "invalid-record");
});

test("a real review candidate with validated source metadata remains restorable", async () => {
  const text = "[10:00, 02/11/2026] Anita: Don't forget the invoice by Friday";
  const snapshot = await createSourceSnapshot(text);
  const analysis = await analyzeTextWithRules(text, { sourceSnapshot: snapshot });
  const storage = fakeStorage();
  const saved = record(text, {
    fingerprint: fingerprint(text),
    analysis,
    sourceSnapshotId: snapshot.snapshotId,
    sourceMessageFingerprints: snapshot.messages.map((message) => fingerprint(JSON.stringify([
      message.authorRaw || "",
      message.timestampRaw || "",
      (message.rawText || "").replace(/(?:\r\n|\r|\n)+$/u, ""),
    ]))),
    sourceMessageRanges: snapshot.messages.map(({ startOffset, endOffset }) => ({ startOffset, endOffset })),
  });

  assert.equal(analysis.reviewQueue.length, 1);
  assert.equal(saveSession(storage, saved).saved, true);
  assert.equal(loadSession(storage, saved.fingerprint).analysis.reviewQueue.length, 1);
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
    sourceSnapshotId: `sha256:${"b".repeat(64)}`,
    sourceMessageRanges: [{ startOffset: 0, endOffset: 12 }],
  });

  assert.equal(saveSession(storage, saved).saved, true);
  const stored = JSON.parse([...storage.values.values()][0]);

  assert.equal(stored.sourceSnapshotId, `sha256:${"b".repeat(64)}`);
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
  const validAnalysis = record("large chat").analysis;
  const result = saveSession(storage, record("large chat", {
    analysis: {
      ...validAnalysis,
      actions: [{ ...validAnalysis.actions[0], text: "x".repeat(1024 * 1024) }],
    },
  }));

  assert.equal(result.status, "not-saved");
  assert.equal(result.reason, "too-large");
  assert.equal(storage.values.size, 0);
});

test("malformed nested analysis and review records are rejected before restore", () => {
  const malformedRecords = [
    record("missing analysis list", { analysis: { actions: [] } }),
    record("malformed task", {
      analysis: {
        ...record("valid").analysis,
        actions: [{ id: "task-1", text: 42, owner: null, outcome: "confirmed", urgency: "Low", lifecycleEvents: [] }],
      },
    }),
    record("malformed review", {
      reviewDecisions: { "candidate-1": { decision: "maybe", reviewedAt: "yesterday" } },
    }),
    record("malformed task status", { taskStatuses: { "task-1": "not-a-status" } }),
    record("malformed source range", { sourceMessageRanges: [{ startOffset: -1, endOffset: 14 }] }),
    record("malformed timestamp", { savedAt: "not-an-iso-time" }),
    record("malformed suggested owner", {
      analysis: {
        ...record("valid").analysis,
        actions: [{ ...record("valid").analysis.actions[0], suggestedOwner: 17 }],
      },
    }),
    record("malformed review queue detail", {
      analysis: {
        ...record("valid").analysis,
        reviewQueue: [{
          id: "candidate-1",
          text: "Send the report",
          sourceEvidence: evidence(),
          sourceReferenceStatus: "valid",
          missing: "owner",
        }],
      },
    }),
    record("malformed valid-source finding", {
      analysis: {
        ...record("valid").analysis,
        deadlines: [{
          id: "deadline-1",
          text: "Send by Friday",
          dates: ["Friday"],
          sourceEvidence: null,
          sourceReferenceStatus: "valid",
        }],
      },
    }),
    record("foreign source evidence", {
      analysis: {
        ...record("valid").analysis,
        actions: [{
          ...record("valid").analysis.actions[0],
          sourceEvidence: evidence({ snapshotId: `sha256:${"c".repeat(64)}` }),
          sourceReferenceStatus: "valid",
        }],
      },
    }),
    record("source evidence outside message ranges", {
      analysis: {
        ...record("valid").analysis,
        actions: [{
          ...record("valid").analysis.actions[0],
          sourceEvidence: evidence({ startOffset: 1, endOffset: 15 }),
          sourceReferenceStatus: "valid",
        }],
      },
    }),
  ];

  for (const [index, saved] of malformedRecords.entries()) {
    const storage = fakeStorage();
    const result = saveSession(storage, saved);
    assert.equal(result.saved, false, `malformed record ${index} must not be persisted`);
    assert.equal(result.reason, "invalid-record");
    assert.equal(storage.values.size, 0);
  }
});

test("malformed persisted nested data is ignored by load and list", () => {
  const storage = fakeStorage();
  const saved = record("malformed nested chat");
  assert.equal(saveSession(storage, saved).saved, true);
  const key = [...storage.values.keys()][0];
  storage.values.set(key, JSON.stringify({
    ...saved,
    analysis: { ...saved.analysis, actions: [{ id: "task-1", text: null }] },
  }));

  assert.equal(loadSession(storage, saved.fingerprint), null);
  assert.equal(listSessions(storage).length, 0);
});
