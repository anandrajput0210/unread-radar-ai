import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeTextLocally,
  analyzeTextWithRules,
  clearLegacySessionCache,
  invalidateAnalysisWork,
  isAnalysisGenerationCurrent,
} from "../../src/lib/ai/localAiEngine.js";

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


test("rules-only analysis resolves demo owners and links an acknowledgement to the assigned task", async () => {
  const rawText = [
    "[14:01, 12/10/2024] Alex Johnson: Hey Team, we need to finalize the Q4 product roadmap.",
    "[14:02, 12/10/2024] Maria Garcia: Can you send over the latest feature requests?",
    "[14:05, 12/10/2024] Alex Johnson: They are in the shared drive. Maria, please update the executive deck with these requests by Friday 5 PM.",
    "[14:06, 12/10/2024] Sarah Chen: I can help review the deck.",
    "[14:10, 12/10/2024] Alex Johnson: Thanks Sarah. We also need to decide on the launch event venue, Mike, can you look into pricing for the downtown hotel? This is urgent as we need to finalize it by Monday.",
    "[14:15, 12/10/2024] Mike Ross: I'm on it.",
  ].join("\n");

  const result = await analyzeTextWithRules(rawText);
  const deckTask = result.actions.find((item) => /executive deck/i.test(item.text));
  const hotelTask = result.actions.find((item) => /downtown hotel/i.test(item.text));
  const featureRequest = result.actions.find((item) => /latest feature requests/i.test(item.text));

  assert.equal(deckTask.owner, "Maria");
  assert.equal(deckTask.dueDate, "Friday, 5 PM");
  assert.equal(deckTask.dueDateStatus, "explicit");
  assert.equal(deckTask.classification, "assigned_task");
  assert.equal(deckTask.sourceReferenceStatus, "valid");
  assert.equal(hotelTask.owner, "Mike");
  assert.equal(hotelTask.dueDate, "Monday");
  assert.equal(hotelTask.dueDateStatus, "contextual");
  assert.equal(hotelTask.classification, "assigned_task");
  assert.equal(hotelTask.acknowledgedBy, "Mike Ross");
  assert.equal(hotelTask.acknowledgementReferenceStatus, "valid");
  assert.equal(hotelTask.acknowledgementEvidence.quote, "[14:15, 12/10/2024] Mike Ross: I'm on it.");
  assert.equal(featureRequest.owner, null);
  assert.equal(featureRequest.classification, "unassigned_request");
  assert.equal(result.actions.length, 4);
});


test("records Qwen inference only after every injected model segment returns valid structured output", async () => {
  let calls = 0;
  const inferenceEngineOverride = {
    chat: {
      completions: {
        async create() {
          calls += 1;
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  summary: ["A report review was requested."],
                  actions: [{ text: "Review the report", owner: "", dueDate: "", urgency: "Low", evidence: "Please review the report.", confidence: 0.8 }],
                  decisions: [],
                  deadlines: [],
                  mentions: [],
                  urgentRows: [],
                }),
              },
            }],
          };
        },
      },
    },
  };

  const result = await analyzeTextLocally(
    "Maya: Please review the report.",
    () => {},
    { forceFresh: true, inferenceEngineOverride },
  );

  assert.equal(calls, 1);
  assert.equal(result.analysisMode, "webgpu-model-plus-rules");
  assert.deepEqual(result.modelExecution, {
    provider: "WebLLM",
    modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    status: "completed",
    source: "browser-webgpu",
    segmentsRequested: 1,
    segmentsCompleted: 1,
    structuredResponsesValidated: 1,
  });
});



test("cross-speaker condition state and revocation evidence survive the local analysis adapter", async () => {
  const rawText = [
    "[09:00, 05/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
    "[09:05, 05/11/2026] Legal Reviewer: Legal approves the wording.",
    "[09:10, 05/11/2026] Chris Wong: I'll contact the supplier tomorrow morning.",
    "[09:20, 05/11/2026] Legal Reviewer: Correction: approval is withdrawn. The wording still needs changes.",
  ].join("\n");
  const result = await analyzeTextWithRules(rawText);
  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.conditionStatus, "reported_rejected");
  const revocation = supplier.supportingEvidence.find((item) => item.kind === "condition-resolution:reported_rejected");
  assert.ok(revocation);
  assert.equal(revocation.sourceReferenceStatus, "valid");
  assert.match(revocation.evidence.quote, /approval is withdrawn/i);
  const supersededApproval = supplier.supportingEvidence.find((item) => item.kind === "condition-resolution:superseded:reported_satisfied");
  assert.ok(supersededApproval);
  assert.equal(supersededApproval.sourceReferenceStatus, "valid");
  assert.match(supersededApproval.evidence.quote, /Legal approves the wording/i);
});

test("cross-speaker approval conflict survives the local analysis adapter as ambiguous evidence", async () => {
  const rawText = [
    "[09:00, 05/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
    "[09:05, 05/11/2026] Legal Reviewer: Legal approves the wording.",
    "[09:12, 05/11/2026] Compliance Reviewer: The wording has not been approved.",
    "[09:20, 05/11/2026] Chris Wong: I'll contact the supplier tomorrow morning.",
  ].join("\n");
  const result = await analyzeTextWithRules(rawText);
  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.conditionStatus, "ambiguous");
  const resolutionEvidence = supplier.supportingEvidence.filter((item) => item.kind.startsWith("condition-resolution:"));
  assert.equal(resolutionEvidence.length, 2);
  assert.ok(resolutionEvidence.every((item) => item.sourceReferenceStatus === "valid"));
});

test("does not produce a completed-inference record when a model response is malformed", async () => {
  const inferenceEngineOverride = {
    chat: { completions: { async create() { return { choices: [{ message: { content: "not JSON" } }] }; } } },
  };

  await assert.rejects(
    analyzeTextLocally("Maya: Please review the report.", () => {}, { forceFresh: true, inferenceEngineOverride }),
    /not valid JSON/,
  );
});

test("model-only suggestions cannot add unsupported owners or calendar dates", async () => {
  const rawText = "[10:00, 05/11/2026] Bella Martin: The meeting notes are attached.";
  const inferenceEngineOverride = {
    chat: {
      completions: {
        async create() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  summary: ["A follow-up may be needed."],
                  actions: [{
                    text: "Send the revised proposal by 30 November",
                    owner: "Bella Martin",
                    dueDate: "2026-11-30",
                    urgency: "High",
                    evidence: "The meeting notes are attached.",
                    confidence: 0.99,
                  }],
                  decisions: [],
                  deadlines: [],
                  mentions: [],
                  urgentRows: [],
                }),
              },
            }],
          };
        },
      },
    },
  };

  const result = await analyzeTextLocally(
    rawText,
    () => {},
    { forceFresh: true, inferenceEngineOverride },
  );

  const suggestion = result.actions.find((item) => item.classification === "model_candidate");
  assert.ok(suggestion);
  assert.equal(suggestion.owner, null);
  assert.equal(suggestion.dueDate, null);
  assert.equal(suggestion.urgency, "Low");
  assert.equal(suggestion.confidence, null);
  assert.equal(suggestion.sourceReferenceStatus, "valid");
  assert.equal(suggestion.semanticStatus, "unverified");
});


test("condition resolution status and its exact supporting evidence survive the analysis adapter", async () => {
  const rawText = await (await import("node:fs/promises")).readFile(
    new URL("../fixtures/accuracy-chat-3-meeting-followups.txt", import.meta.url),
    "utf8",
  );
  const result = await analyzeTextWithRules(rawText);
  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.conditionStatus, "reported_satisfied");
  const resolution = supplier.supportingEvidence.find((item) => item.kind === "condition-resolution:reported_satisfied");
  assert.ok(resolution);
  assert.equal(resolution.sourceReferenceStatus, "valid");
  assert.match(resolution.evidence.quote, /Legal approved the wording/i);
});

test("explicit condition revocation and superseded evidence survive the local analysis adapter", async () => {
  const rawText = [
    "[09:00, 06/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
    "[09:05, 06/11/2026] Legal: Legal approved the wording.",
    "[09:10, 06/11/2026] Legal: Correction: the approval was revoked after the compliance review.",
    "[09:15, 06/11/2026] Chris Wong: I'll contact the supplier only when approval is valid.",
  ].join("\n");
  const result = await analyzeTextWithRules(rawText);
  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.conditionStatus, "reported_rejected");
  const earlierApproval = supplier.supportingEvidence.find((item) => item.kind === "condition-resolution:superseded:reported_satisfied");
  const revocation = supplier.supportingEvidence.find((item) => item.kind === "condition-resolution:reported_rejected");
  assert.ok(earlierApproval);
  assert.ok(revocation);
  assert.equal(earlierApproval.sourceReferenceStatus, "valid");
  assert.equal(revocation.sourceReferenceStatus, "valid");
  assert.match(earlierApproval.evidence.quote, /Legal approved the wording/i);
  assert.match(revocation.evidence.quote, /approval was revoked/i);
});

test("condition states remain conservative and source-grounded across satisfied, rejected, ambiguous and pending cases", async () => {
  const cases = [
    {
      name: "satisfied",
      lines: [
        "[09:00, 06/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
        "[09:10, 06/11/2026] Chris Wong: I'll contact the supplier tomorrow morning.",
        "[09:15, 06/11/2026] Legal: Legal approved the wording.",
      ],
      expected: "reported_satisfied",
    },
    {
      name: "rejected",
      lines: [
        "[09:00, 06/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
        "[09:10, 06/11/2026] Legal: Legal rejected the wording.",
        "[09:15, 06/11/2026] Chris Wong: I'll contact the supplier only after approval is reconsidered.",
      ],
      expected: "reported_rejected",
    },
    {
      name: "ambiguous",
      lines: [
        "[09:00, 06/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
        "[09:05, 06/11/2026] Legal: Legal approved the wording.",
        "[09:10, 06/11/2026] Legal: Legal rejected the wording after review.",
        "[09:15, 06/11/2026] Chris Wong: I'll contact the supplier tomorrow morning.",
      ],
      expected: "ambiguous",
    },
    {
      name: "pending-hypothetical",
      lines: [
        "[09:00, 06/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
        "[09:15, 06/11/2026] Chris Wong: I'll contact the supplier once Legal approves the wording.",
      ],
      expected: "pending_verification",
    },
  ];

  for (const item of cases) {
    const result = await analyzeTextWithRules(item.lines.join("\n"));
    const supplier = result.actions.find((action) => /contact the supplier/i.test(action.text));
    assert.ok(supplier, `${item.name}: expected a supplier task`);
    assert.equal(supplier.conditionStatus, item.expected, `${item.name}: condition status`);
    for (const detail of supplier.supportingEvidence || []) {
      assert.equal(detail.sourceReferenceStatus, "valid", `${item.name}: supporting evidence reference`);
    }
  }
});
