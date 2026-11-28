import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";
import { createSourceSnapshot } from "../../src/lib/import/sourceSnapshot.js";
import { SAMPLE_CHATS } from "../../src/lib/sampleChats.js";
import { buildFollowUpMessage } from "../../src/lib/export/followUpMessage.js";
import {
  SCHEMA_VERSION,
  fingerprint,
  loadSession,
  saveSession,
} from "../../src/lib/persistence/store.js";
import { buildCatchUpBrief, listSpeakers } from "../../src/lib/views/catchUpBrief.js";
import { buildTaskWhy } from "../../src/lib/views/taskWhy.js";
import { diffSessions } from "../../src/lib/views/whatChanged.js";

async function analyzeChat(text) {
  const snapshot = await createSourceSnapshot(text);
  const analysis = await analyzeTextWithRules(text, { sourceSnapshot: snapshot });
  return { analysis, snapshot, speakers: listSpeakers(snapshot) };
}

const disputedChat = [
  "Asha: Neha, please send the quotation by Friday.",
  "Ben: I'll take it.",
  "Neha: thanks Ben",
].join("\n");

const ambiguousClaimChat = [
  "Ravi K: Morning all.",
  "Ravi S: Hi.",
  "Asha: Ravi, please update the invoice.",
  "Priya: Sure, I'll do it.",
].join("\n");

test("a competing commitment disputes the named owner without assigning the volunteer", async () => {
  const { analysis } = await analyzeChat(disputedChat);
  const task = analysis.actions.find((action) => action.text.includes("quotation"));

  assert.ok(task);
  assert.equal(task.owner, null);
  assert.equal(task.ownerBasis, "disputed");
  assert.equal(task.ownerCandidateName, "Neha");
  assert.ok(task.lifecycleEvents.some((event) => event.text === "I'll take it."));
  assert.equal(task.lifecycleEvents.find((event) => event.text === "I'll take it.")?.sourceReferenceStatus, "valid");
});

const generalizedDisputeChats = [
  {
    title: "\"I can handle that\" disputes the existing owner",
    claim: "I can handle that.",
    response: "great, thanks Ben",
  },
  {
    title: "\"Let me take this one\" disputes the existing owner",
    claim: "Let me take this one.",
    response: "Thanks.",
  },
  {
    title: "\"I'll take it\" disputes without a named acknowledgement",
    claim: "I'll take it.",
    response: "ok",
    respondent: "Asha",
  },
];

for (const scenario of generalizedDisputeChats) {
  test(scenario.title, async () => {
    const claimant = "Ben";
    const { analysis } = await analyzeChat([
      "Asha: Neha, please send the vendor quotation.",
      `${claimant}: ${scenario.claim}`,
      `${scenario.respondent || "Neha"}: ${scenario.response}`,
    ].join("\n"));
    const task = analysis.actions.find((action) => action.text.includes("vendor quotation"));

    assert.ok(task);
    assert.equal(task.owner, null);
    assert.equal(task.ownerBasis, "disputed");
    assert.equal(task.ownerCandidateName, "Neha");
    assert.ok(task.lifecycleEvents.some((event) => event.type === "ownership-disputed"
      && event.actor === claimant
      && event.text === scenario.claim));
    assert.equal(analysis.actions.some((action) => action.owner === claimant), false);
  });
}

test("a different speaker's generic volunteer does not claim an ambiguously addressed task", async () => {
  const { analysis } = await analyzeChat(ambiguousClaimChat);
  const task = analysis.actions.find((action) => action.text.includes("update the invoice"));

  assert.ok(task);
  assert.equal(task.owner, null);
  assert.equal(task.ownerBasis, "ambiguous");
  assert.equal(task.ownerCandidateName, "Ravi");
});

test("the existing owner acknowledgement keeps the task with that owner", async () => {
  const { analysis } = await analyzeChat([
    "Asha: Neha, please send the vendor quotation.",
    "Neha: I'll send it.",
  ].join("\n"));
  const task = analysis.actions.find((action) => action.text.includes("vendor quotation"));

  assert.equal(task?.owner, "Neha");
  assert.notEqual(task?.ownerBasis, "disputed");
});

test("a different speaker's commitment to unrelated work does not dispute the task", async () => {
  const { analysis } = await analyzeChat([
    "Asha: Neha, please send the vendor quotation.",
    "Ben: I'll update the calendar.",
  ].join("\n"));
  const task = analysis.actions.find((action) => action.text.includes("vendor quotation"));

  assert.equal(task?.owner, "Neha");
  assert.notEqual(task?.ownerBasis, "disputed");
});

test("unique names, self-claims, named handovers, unowned claims, and samples keep their owners", async () => {
  const unique = await analyzeChat([
    "Asha: Neha, please send the quotation by Friday.",
    "Neha: I'll take it.",
  ].join("\n"));
  const uniqueTask = unique.analysis.actions.find((action) => action.text.includes("quotation"));
  assert.equal(uniqueTask?.owner, "Neha");
  assert.ok(uniqueTask?.lifecycleEvents.some((event) => event.type === "acknowledged" && event.actor === "Neha"));

  const handover = await analyzeChat([
    "Ravi K: Morning all.",
    "Ravi S: Hi.",
    "Asha: Ravi, please update the invoice.",
    "Asha: Priya will take over the invoice.",
  ].join("\n"));
  const handedOverTask = handover.analysis.actions.find((action) => action.text.includes("update the invoice"));
  assert.equal(handedOverTask?.owner, "Priya");

  const namedHandover = await analyzeChat([
    "Asha: Neha, please send the vendor quotation.",
    "Neha: Ben will take over the vendor quotation.",
  ].join("\n"));
  const explicitlyHandedOver = namedHandover.analysis.actions.find((action) => action.text.includes("vendor quotation"));
  assert.equal(explicitlyHandedOver?.owner, "Ben");
  assert.ok(explicitlyHandedOver?.lifecycleEvents.some((event) => event.type === "reassigned"));

  const unowned = await analyzeChat([
    "Asha: Please send the invoice by Friday.",
    "Ben: I'll do it.",
  ].join("\n"));
  assert.equal(unowned.analysis.actions.find((action) => action.text.includes("invoice"))?.owner, "Ben");

  const english = await analyzeChat(SAMPLE_CHATS.english);
  const hinglish = await analyzeChat(SAMPLE_CHATS.hinglish);
  assert.equal(english.analysis.actions[0]?.owner, "Maria");
  assert.equal(hinglish.analysis.actions[0]?.owner, "Vikram");
});

test("disputed ownership is not assigned in the brief, Why panel, or follow-up", async () => {
  const { analysis, speakers } = await analyzeChat(disputedChat);
  const task = analysis.actions.find((action) => action.text.includes("quotation"));
  assert.ok(task);

  const brief = buildCatchUpBrief([task], { me: "Neha", speakers });
  assert.equal(brief.groups.assignedToYou.length, 0);
  assert.equal(brief.groups.assignedToOthers.length, 0);
  assert.equal(brief.groups.noOwner.length + brief.groups.needsReview.length, 1);

  const why = buildTaskWhy(task, { messages: [], speakers });
  assert.equal(why.ownerBasis.reason, "More than one person may own this. Not guessing.");
  assert.doesNotMatch(why.ownerBasis.reason, /\b(?:Neha|Ben)\b/u);

  const followUp = buildFollowUpMessage([task], { speakers }).text;
  assert.match(followUp, /Still unclear - who is taking these\?\n- send the quotation by Friday/u);
  assert.doesNotMatch(followUp, /\b(?:Neha|Ben)\b/u);
});

test("disputed ownership is accepted by persistence and reported as an owner change", async () => {
  const { analysis, snapshot } = await analyzeChat(disputedChat);
  const sourceTask = analysis.actions.find((action) => action.text.includes("quotation"));
  assert.ok(sourceTask);
  const persistedAnalysis = {
    ...analysis,
    actions: analysis.actions.map((action) => action.id === sourceTask.id ? {
      ...action,
      owner: null,
      ownerBasis: "disputed",
      ownerCandidateName: "Neha",
    } : action),
  };
  const saved = {
    fingerprint: fingerprint(disputedChat),
    savedAt: "2026-11-25T12:00:00.000Z",
    schemaVersion: SCHEMA_VERSION,
    analysis: persistedAnalysis,
    reviewDecisions: {},
    taskStatuses: {},
    selectedIdentity: null,
    sourceMessageFingerprints: snapshot.messages.map((message) => fingerprint(message.rawText || "")),
    sourceSnapshotId: snapshot.snapshotId,
    sourceMessageRanges: snapshot.messages.map(({ startOffset, endOffset }) => ({ startOffset, endOffset })),
  };
  const storage = {
    values: new Map(),
    get length() { return this.values.size; },
    key(index) { return [...this.values.keys()][index] ?? null; },
    getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, String(value)); },
    removeItem(key) { this.values.delete(key); },
  };

  assert.equal(saveSession(storage, saved).saved, true);
  const restored = loadSession(storage, saved.fingerprint);
  assert.equal(restored.analysis.actions.find((action) => action.id === sourceTask.id)?.ownerBasis, "disputed");

  const quote = "Asha: Neha, please send the quotation by Friday.";
  const diff = diffSessions(
    { analysis: { actions: [{ id: "task-1", text: "send the quotation", owner: "Neha", sourceEvidence: { quote, messageIndex: 0 } }] } },
    { analysis: { actions: [{ id: "task-1", text: "send the quotation", owner: null, ownerBasis: "disputed", sourceEvidence: { quote, messageIndex: 0 } }] } },
  );
  assert.equal(diff.changedOwner.length, 1);
  assert.equal(diff.changedOwner[0].oldValue, "Neha");
  assert.equal(diff.changedOwner[0].newValue, null);
});
