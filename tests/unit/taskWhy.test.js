import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";
import { createSourceSnapshot } from "../../src/lib/import/sourceSnapshot.js";
import { listSpeakers } from "../../src/lib/views/catchUpBrief.js";
import { SAMPLE_CHATS } from "../../src/lib/sampleChats.js";
import { TRAP_CHATS } from "../../src/lib/trapChats.js";
import { buildTaskWhy } from "../../src/lib/views/taskWhy.js";

async function analyzeChat(text) {
  const [analysis, snapshot] = await Promise.all([
    analyzeTextWithRules(text),
    createSourceSnapshot(text),
  ]);
  return {
    analysis,
    snapshot,
    messages: snapshot.messages,
    speakers: listSpeakers(snapshot),
  };
}

test("unknown owner is not attributed to a speaker", () => {
  const result = buildTaskWhy({
    text: "Send the report",
    owner: null,
    sourceReferenceStatus: "valid",
  }, {
    messages: [{ authorRaw: "Alex Johnson", startOffset: 0, endOffset: 20, rawText: "Alex Johnson: Send the report" }],
    speakers: ["Alex Johnson", "Maria Garcia"],
  });

  assert.equal(result.ownerBasis.status, "unknown");
  assert.equal(result.ownerBasis.reason, "No owner was named or claimed in this chat. Not guessing.");
  assert.doesNotMatch(result.ownerBasis.reason, /Alex Johnson|Maria Garcia/u);
});

test("an owner matching two speakers is shown as ambiguous without naming either", () => {
  const result = buildTaskWhy({
    text: "Review the plan",
    owner: "Alex",
    sourceEvidence: { quote: "Please review the plan" },
  }, {
    messages: [],
    speakers: ["Alex Johnson", "Alex Chen"],
  });

  assert.equal(result.ownerBasis.status, "ambiguous");
  assert.equal(result.ownerBasis.reason, "More than one person could match. Not guessing.");
  assert.doesNotMatch(result.ownerBasis.reason, /Alex Johnson|Alex Chen/u);
});

test("a name in source text is not ownership provenance by itself", () => {
  const result = buildTaskWhy({
    text: "Review the report",
    owner: "Priya",
    classification: "unclassified_candidate",
    sourceEvidence: { quote: "Rahul asked whether Priya had seen the report." },
  }, {
    messages: [],
    speakers: ["Rahul", "Priya"],
  });

  assert.equal(result.ownerBasis.status, "unknown");
  assert.match(result.ownerBasis.reason, /basis is not recorded|No owner could be established/u);
  assert.doesNotMatch(result.ownerBasis.reason, /Priya/u);
});

test("structured extraction classification explains assignment without matching a name in the quote", () => {
  const result = buildTaskWhy({
    text: "Update the deck",
    owner: "Maria",
    classification: "assigned_task",
    sourceEvidence: { quote: "Alex: Please update the executive deck by Friday." },
  }, { messages: [], speakers: ["Maria", "Alex"] });

  assert.equal(result.ownerBasis.status, "named-in-request");
  assert.match(result.ownerBasis.reason, /extractor|assigned task/i);
});

test("collective and unassigned requests are not attributed to an individual", () => {
  const collective = buildTaskWhy({
    text: "Share the notes",
    owner: null,
    classification: "collective_task",
  }, { messages: [], speakers: ["Alex", "Priya"] });
  const unassigned = buildTaskWhy({
    text: "Review the plan",
    owner: null,
    classification: "unassigned_request",
  }, { messages: [], speakers: ["Alex", "Priya"] });

  assert.equal(collective.ownerBasis.status, "collective");
  assert.match(collective.ownerBasis.reason, /collective|no individual owner/i);
  assert.equal(unassigned.ownerBasis.status, "unassigned-request");
  assert.equal(unassigned.ownerBasis.reason, "No owner was named or claimed in this chat. Not guessing.");
  assert.doesNotMatch(JSON.stringify([collective.ownerBasis, unassigned.ownerBasis]), /Alex|Priya/u);
});

test("implied addressee is explained only when the task records that structured basis", () => {
  const result = buildTaskWhy({
    text: "Send the report",
    owner: "Alex",
    ownerSource: "implied_addressee",
    classification: "unclassified_candidate",
  }, { messages: [], speakers: ["Alex"] });

  assert.equal(result.ownerBasis.status, "implied-addressee");
  assert.match(result.ownerBasis.reason, /implied addressee/u);
});

test("possible tasks carry an explicit review caveat", () => {
  const result = buildTaskWhy({
    text: "Review the draft",
    owner: null,
    outcome: "possible",
  }, { messages: [], speakers: [] });

  assert.ok(result.caveats.includes("Possible task - not confirmed"));
  assert.equal(result.extraction.reviewReason, "Not confirmed. Needs a human look.");
});

test("extractor outcome and explicit human acceptance remain separate", () => {
  const result = buildTaskWhy({
    text: "Review the draft",
    owner: null,
    outcome: "possible",
    outcomeReason: "Suggestion, not a direct request",
    humanReviewStatus: "promoted",
  }, { messages: [], speakers: [] });

  assert.equal(result.extraction.status, "possible");
  assert.equal(result.humanReview.status, "promoted");
  assert.match(result.humanReview.text, /accepted for tracking/i);
  assert.equal(result.caveats.includes("Possible task - not confirmed"), false);
});

test("contextual timing is labelled as inferred from context", () => {
  const result = buildTaskWhy({
    text: "Send the invoice",
    dueDate: "kal tak",
    dueDateStatus: "contextual",
    resolvedDueDate: null,
  }, { messages: [], speakers: [] });

  assert.equal(result.timing.status, "contextual");
  assert.match(result.timing.text, /inferred from context/i);
});

test("English and Hinglish samples retain their source-grounded owners and evidence", async () => {
  const english = await analyzeChat(SAMPLE_CHATS.english);
  const englishTask = english.analysis.actions[0];
  const englishWhy = buildTaskWhy(englishTask, english);
  assert.equal(englishTask.owner, "Maria");
  assert.equal(english.analysis.actions.length, 1);
  assert.equal(englishWhy.evidence.quote, englishTask.sourceEvidence.quote);
  assert.equal(englishWhy.evidence.messageIndex, 0);
  assert.equal(englishWhy.ownerBasis.status, "named-in-request");
  assert.equal(englishWhy.timeline[1].speaker, "Maria Garcia");
  assert.equal(englishWhy.timeline[1].messageIndex, 1);

  const hinglish = await analyzeChat(SAMPLE_CHATS.hinglish);
  const hinglishTask = hinglish.analysis.actions[0];
  const hinglishWhy = buildTaskWhy(hinglishTask, hinglish);
  assert.equal(hinglishTask.owner, "Vikram");
  assert.match(hinglishTask.text, /GST invoice/i);
  assert.equal(hinglishWhy.evidence.quote, hinglishTask.sourceEvidence.quote);
  assert.equal(hinglishWhy.evidence.messageIndex, 0);
  assert.equal(hinglishWhy.ownerBasis.status, "named-in-request");
});

test("fixture tasks produce a single request event when no lifecycle event exists", async () => {
  const text = await readFile(new URL("../fixtures/accuracy-chat-1-product-launch.txt", import.meta.url), "utf8");
  const context = await analyzeChat(text);
  const task = context.analysis.actions.find((item) => item.text.includes("pricing section"));
  assert.ok(task, "expected the fixture's pricing review task");
  assert.equal(task.owner, "Elena Ruiz");
  assert.equal(task.lifecycleEvents.length, 0);

  const result = buildTaskWhy(task, context);
  assert.equal(result.timeline.length, 1);
  assert.equal(result.timeline[0].type, "request");
  assert.match(result.timeline[0].quote, /I can review the pricing section/u);
});

test("acknowledged sample task shows acknowledgement without inventing completion", async () => {
  const context = await analyzeChat(SAMPLE_CHATS.english);
  const task = context.analysis.actions[0];
  const result = buildTaskWhy(task, context);

  assert.deepEqual(result.timeline.map((event) => event.type), ["request", "acknowledged"]);
  assert.ok(result.timeline.every((event) => typeof event.quote === "string" && event.quote.length > 0));
  assert.equal(result.timeline.some((event) => event.type === "completed"), false);
});

test("incident-response fixture owner is grounded in the speaker's own commitment", async () => {
  const text = await readFile(new URL("../fixtures/accuracy-chat-2-incident-response.txt", import.meta.url), "utf8");
  const context = await analyzeChat(text);
  const task = context.analysis.actions.find((item) => item.text.includes("inspect the logs"));
  assert.ok(task, "expected the fixture's log-inspection task");
  assert.equal(task.owner, "Raj Mehta");

  const result = buildTaskWhy(task, context);
  assert.equal(result.ownerBasis.status, "claimed-by-speaker");
  assert.equal(result.timeline[0].speaker, "Raj Mehta");
});

test("why output does not introduce prohibited past-due wording", async () => {
  const context = await analyzeChat(SAMPLE_CHATS.english);
  const output = JSON.stringify(buildTaskWhy(context.analysis.actions[0], context));
  assert.doesNotMatch(output, /\b(?:missed|overdue)\b/iu);
});

test("trap-chat abstention explanations are exact and do not name speakers", async () => {
  const expectedReasons = {
    "vague-someone": "No owner was named or claimed in this chat. Not guessing.",
    "ambiguous-handoff": "No owner was named or claimed in this chat. Not guessing.",
    "kal-dekhenge": "No owner was named or claimed in this chat. Not guessing.",
    "same-first-name": "More than one person could match. Not guessing.",
  };

  for (const [name, text] of Object.entries(TRAP_CHATS)) {
    const context = await analyzeChat(text);
    const task = name === "same-first-name"
      ? context.analysis.actions.find((item) => item.text.includes("draft invoice"))
      : context.analysis.actions.find((item) => item.text.includes("invoice mismatch"))
        ?? context.analysis.actions[0];
    if (name === "same-first-name") assert.equal(task?.owner, null);
    const result = buildTaskWhy(task ?? {
      text: "No extracted task",
      owner: null,
      outcome: "confirmed",
    }, context);

    assert.equal(result.ownerBasis.reason, expectedReasons[name], name);
    for (const speaker of context.speakers) {
      assert.ok(!result.ownerBasis.reason.includes(speaker), `${name} reason named ${speaker}`);
    }
    if (name === "vague-someone") {
      assert.equal(result.extraction.reviewReason, "Not confirmed. Needs a human look.");
    }
  }
});
