import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";
import { createSourceSnapshot } from "../../src/lib/import/sourceSnapshot.js";
import { buildTaskWhy } from "../../src/lib/views/taskWhy.js";
import { listSpeakers } from "../../src/lib/views/catchUpBrief.js";
import {
  fingerprint,
  loadPersistencePreference,
  savePersistencePreference,
} from "../../src/lib/persistence/store.js";
import {
  loadDismissedWorkspaces,
  filterVisibleSavedWorkspaces,
  listSavedWorkspaces,
  restoreSavedWorkspace,
  saveDismissedWorkspaces,
  saveWorkspace,
} from "../../src/lib/persistence/workspace.js";

function memoryStorage() {
  const entries = new Map();
  return {
    entries,
    get length() { return entries.size; },
    key(index) { return [...entries.keys()][index] ?? null; },
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, String(value)); },
    removeItem(key) { entries.delete(key); },
  };
}

async function analyze(text, options) {
  const sourceSnapshot = await createSourceSnapshot(text, options);
  const analysis = await analyzeTextWithRules(text, { sourceSnapshot });
  return { sourceSnapshot, analysis };
}

test("the app persistence adapter saves an opted-in workspace and discovers it for startup", async () => {
  const storage = memoryStorage();
  const text = "Asha: Neha, please send the vendor quotation.";
  const workspace = await analyze(text);

  assert.equal(savePersistencePreference(storage, true).success, true);
  assert.equal(loadPersistencePreference(storage), true);
  assert.equal(saveWorkspace(storage, true, workspace).saved, true);

  const saved = listSavedWorkspaces(storage);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].sourceText, text);
  assert.equal(saved[0].sourceSnapshotId, workspace.sourceSnapshot.snapshotId);
  assert.equal(loadPersistencePreference(storage), true);
});

test("an explicit restore hydrates input, source messages, speakers, analysis and review state", async () => {
  const storage = memoryStorage();
  const text = [
    "Asha: Neha, please send the vendor quotation.",
    "Neha: I'll send it.",
  ].join("\n");
  const workspace = await analyze(text);
  const task = workspace.analysis.actions.find((action) => action.text.includes("vendor quotation"));
  const saveResult = saveWorkspace(storage, true, {
    ...workspace,
    taskStatuses: { [task.id]: "confirmed" },
    reviewDecisions: {},
    selectedIdentity: "Neha",
  });

  assert.equal(saveResult.saved, true);
  const restored = await restoreSavedWorkspace(storage, fingerprint(text));

  assert.equal(restored.ok, true);
  assert.equal(restored.chatText, text);
  assert.equal(restored.sourceSnapshot.snapshotId, workspace.sourceSnapshot.snapshotId);
  assert.deepEqual(restored.sourceSnapshot.messages, workspace.sourceSnapshot.messages);
  assert.deepEqual(restored.speakers, ["Asha", "Neha"]);
  assert.deepEqual(restored.taskStatuses, { [task.id]: "confirmed" });
  assert.equal(restored.selectedIdentity, "Neha");
  assert.deepEqual(restored.analysis.actions, workspace.analysis.actions);
});

test("restore preserves explicit date-order choice and snapshot identity", async () => {
  const storage = memoryStorage();
  const text = "[10:00, 02/03/2024] Asha: Neha, please send the quotation.";
  const workspace = await analyze(text, { dateOrder: "dmy" });

  assert.equal(saveWorkspace(storage, true, workspace).saved, true);
  const restored = await restoreSavedWorkspace(storage, fingerprint(text));

  assert.equal(restored.ok, true);
  assert.equal(restored.dateOrder, "dmy");
  assert.equal(restored.sourceSnapshot.snapshotId, workspace.sourceSnapshot.snapshotId);
  assert.deepEqual(
    restored.sourceSnapshot.messages.map((message) => message.timestamp),
    workspace.sourceSnapshot.messages.map((message) => message.timestamp),
  );
});

test("saving disabled does not persist a new workspace", async () => {
  const storage = memoryStorage();
  const workspace = await analyze("Asha: Neha, please send the vendor quotation.");

  assert.equal(saveWorkspace(storage, false, workspace).status, "disabled");
  assert.equal(listSavedWorkspaces(storage).length, 0);
  assert.equal(storage.entries.size, 0);
});

test("turning saving off preserves existing records while clearing the saved preference", async () => {
  const storage = memoryStorage();
  const text = "Asha: Neha, please send the vendor quotation.";
  assert.equal(savePersistencePreference(storage, true).success, true);
  assert.equal(saveWorkspace(storage, true, await analyze(text)).saved, true);

  assert.equal(savePersistencePreference(storage, false).success, true);

  assert.equal(loadPersistencePreference(storage), false);
  assert.equal(listSavedWorkspaces(storage).length, 1);
});

test("dismissing survives a page refresh without deleting the saved analysis", async () => {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const text = "Asha: Neha, please send the vendor quotation.";
  const workspace = await analyze(text);
  assert.equal(saveWorkspace(localStorage, true, workspace).saved, true);

  assert.equal(saveDismissedWorkspaces(sessionStorage, [fingerprint(text)]).success, true);
  const dismissedAfterReload = loadDismissedWorkspaces(sessionStorage);

  assert.equal(dismissedAfterReload.has(fingerprint(text)), true);
  assert.equal(listSavedWorkspaces(localStorage).length, 1);
});

test("restored workspaces reappear after refresh until explicitly dismissed", async () => {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const text = "Asha: Neha, please send the vendor quotation.";
  const workspace = await analyze(text);
  const savedFingerprint = fingerprint(text);

  assert.equal(savePersistencePreference(localStorage, true).success, true);
  assert.equal(saveWorkspace(localStorage, true, workspace).saved, true);

  let activeFingerprint = null;
  const visibleSavedWorkspaces = () => filterVisibleSavedWorkspaces(
    listSavedWorkspaces(localStorage),
    loadDismissedWorkspaces(sessionStorage),
    activeFingerprint,
  );
  assert.equal(visibleSavedWorkspaces().length, 1);

  const firstRestore = await restoreSavedWorkspace(localStorage, savedFingerprint);
  assert.equal(firstRestore.ok, true);
  assert.equal(firstRestore.fingerprint, savedFingerprint);
  activeFingerprint = firstRestore.fingerprint;
  assert.equal(visibleSavedWorkspaces().length, 0);
  assert.equal(loadDismissedWorkspaces(sessionStorage).has(savedFingerprint), false);

  activeFingerprint = null;
  assert.equal(visibleSavedWorkspaces().length, 1);
  const secondRestore = await restoreSavedWorkspace(localStorage, savedFingerprint);
  assert.equal(secondRestore.ok, true);
  activeFingerprint = secondRestore.fingerprint;
  assert.equal(visibleSavedWorkspaces().length, 0);
  assert.equal(loadDismissedWorkspaces(sessionStorage).has(savedFingerprint), false);

  activeFingerprint = null;
  assert.equal(visibleSavedWorkspaces().length, 1);
  const dismissedFingerprints = loadDismissedWorkspaces(sessionStorage);
  dismissedFingerprints.add(savedFingerprint);
  assert.equal(saveDismissedWorkspaces(sessionStorage, dismissedFingerprints).success, true);

  assert.equal(visibleSavedWorkspaces().length, 0);
  assert.equal(listSavedWorkspaces(localStorage).length, 1);
  assert.equal(loadDismissedWorkspaces(sessionStorage).has(savedFingerprint), true);
});

test("corrupt and incompatible saved records are ignored without throwing", async () => {
  const storage = memoryStorage();
  storage.setItem("unread-radar-ai:local-session:v2:corrupt", "{not-json");

  assert.doesNotThrow(() => listSavedWorkspaces(storage));
  assert.deepEqual(listSavedWorkspaces(storage), []);
  await assert.doesNotReject(restoreSavedWorkspace(storage, fingerprint("unknown chat")));

  const text = "unstructured conversation";
  const sourceSnapshot = await createSourceSnapshot(text);
  const workspace = {
    sourceSnapshot,
    analysis: {
      summary: [],
      actions: [],
      reviewQueue: [],
      decisions: [],
      deadlines: [],
      mentions: [],
      urgentRows: [],
      alerts: [],
      lineCount: 1,
      sourceChunks: 1,
      modelId: "",
      sourceSnapshotId: sourceSnapshot.snapshotId,
    },
  };
  assert.equal(saveWorkspace(storage, true, workspace).saved, true);
  const key = [...storage.entries.keys()].find((item) => item.endsWith(fingerprint(text)));
  const record = JSON.parse(storage.getItem(key));
  const wrongSnapshotId = `sha256:${"f".repeat(64)}`;
  storage.setItem(key, JSON.stringify({
    ...record,
    sourceSnapshotId: wrongSnapshotId,
    analysis: { ...record.analysis, sourceSnapshotId: wrongSnapshotId },
  }));
  const invalid = await restoreSavedWorkspace(storage, fingerprint(text));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, "source-mismatch");
});

test("duplicate source occurrences keep valid independent evidence through restore and Why rendering", async () => {
  const text = [
    "Asha: Neha, please send the vendor quotation.",
    "Asha: Neha, please send the vendor quotation.",
  ].join("\n");
  const workspace = await analyze(text);
  const tasks = workspace.analysis.actions.filter((action) => action.text.includes("vendor quotation"));
  assert.equal(tasks.length, 1);
  const task = tasks[0];
  const secondOccurrence = task.supportingEvidence.find((item) => item.kind === "duplicate-occurrence");
  assert.ok(task.sourceEvidence);
  assert.ok(secondOccurrence?.evidence);
  assert.equal(task.sourceReferenceStatus, "valid");
  assert.equal(secondOccurrence.sourceReferenceStatus, "valid");
  const whyBeforeSave = buildTaskWhy(task, {
    messages: workspace.sourceSnapshot.messages,
    speakers: listSpeakers(workspace.sourceSnapshot),
  });
  assert.ok(whyBeforeSave.timeline.some((event) => event.type === "repeated-request"
    && event.quote === secondOccurrence.evidence.quote
    && event.referenceStatus === "valid"));

  const storage = memoryStorage();
  assert.equal(saveWorkspace(storage, true, workspace).saved, true);
  const restored = await restoreSavedWorkspace(storage, fingerprint(text));
  assert.equal(restored.ok, true);
  const restoredTasks = restored.analysis.actions.filter((action) => action.text.includes("vendor quotation"));
  assert.equal(restoredTasks.length, 1);
  const restoredTask = restoredTasks[0];
  const refs = [restoredTask.sourceEvidence, ...restoredTask.supportingEvidence
    .filter((item) => item.kind === "duplicate-occurrence")
    .map((item) => item.evidence)];

  assert.equal(refs.length, 2);
  assert.equal(restoredTask.sourceReferenceStatus, "valid");
  assert.equal(restoredTask.supportingEvidence.find((item) => item.kind === "duplicate-occurrence")?.sourceReferenceStatus, "valid");
  assert.ok(refs.every((ref) => ref && ref.snapshotId === restored.sourceSnapshot.snapshotId));
  assert.ok(refs.every((ref) => ref.quote === text.slice(ref.startOffset, ref.endOffset)));
  assert.equal(new Set(refs.map((ref) => ref.messageId)).size, 2);
  const whyAfterRestore = buildTaskWhy(restoredTask, {
    messages: restored.sourceSnapshot.messages,
    speakers: restored.speakers,
  });
  assert.ok(whyAfterRestore.timeline.some((event) => event.type === "repeated-request"
    && event.quote === refs[1].quote
    && event.referenceStatus === "valid"));
});

test("disputed ownership and in-progress lifecycle remain separate after restore", async () => {
  const text = [
    "Asha: Neha, please send the vendor quotation.",
    "Neha: I'm working on the quotation now.",
    "Ben: I'll send the vendor quotation.",
  ].join("\n");
  const workspace = await analyze(text);
  const task = workspace.analysis.actions.find((action) => action.text.includes("vendor quotation"));
  assert.equal(task.owner, null);
  assert.equal(task.ownerBasis, "disputed");
  assert.equal(task.lifecycleStatus, "in-progress");

  const storage = memoryStorage();
  assert.equal(saveWorkspace(storage, true, {
    ...workspace,
    taskStatuses: { [task.id]: "needs-review" },
  }).saved, true);
  const restored = await restoreSavedWorkspace(storage, fingerprint(text));
  assert.equal(restored.ok, true);
  const restoredTask = restored.analysis.actions.find((action) => action.id === task.id);

  assert.equal(restoredTask.owner, null);
  assert.equal(restoredTask.ownerBasis, "disputed");
  assert.equal(restoredTask.lifecycleStatus, "in-progress");
  assert.equal(restored.taskStatuses[task.id], "needs-review");
});
