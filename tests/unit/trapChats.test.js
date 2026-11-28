import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";
import { SAMPLE_CHATS } from "../../src/lib/sampleChats.js";
import { TRAP_CHATS } from "../../src/lib/trapChats.js";

const CLAIM_SOURCES = new Set([
  "claimed_by_commitment",
  "claimed_by_progress",
  "unique_acknowledgement",
]);

async function analyze(chat) {
  const result = await analyzeTextWithRules(chat);
  const findings = [...result.actions, ...result.reviewQueue];

  for (const finding of findings) {
    assert.equal(finding.sourceReferenceStatus, "valid");
  }
  assert.doesNotMatch(JSON.stringify(result), /\b(?:missed|overdue)\b/iu);

  return { result, findings };
}

function assertNoConfidentOwner(findings, chatName) {
  for (const finding of findings) {
    assert.ok(
      finding.outcome === "possible"
        || finding.owner == null
        || ["unknown", "ambiguous"].includes(finding.ownerBasis)
        || ["unknown", "ambiguous"].includes(finding.ownerStatus),
      `${chatName} must not assert a confident owner: ${JSON.stringify(finding)}`,
    );
  }
}

test("vague-someone does not produce a confirmed task with an owner", async () => {
  const { findings } = await analyze(TRAP_CHATS["vague-someone"]);
  assertNoConfidentOwner(findings, "vague-someone");
});

test("ambiguous-handoff does not produce an accepted or claimed owner", async () => {
  const { findings } = await analyze(TRAP_CHATS["ambiguous-handoff"]);
  assertNoConfidentOwner(findings, "ambiguous-handoff");
  assert.ok(findings.every((finding) => !CLAIM_SOURCES.has(finding.ownerSource)));
});

test("kal-dekhenge does not resolve a due date", async () => {
  const { findings } = await analyze(TRAP_CHATS["kal-dekhenge"]);
  assert.ok(findings.every((finding) => finding.resolvedDueDate == null));
});

function taskContaining(findings, phrase) {
  return findings.find((finding) => finding.text.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()));
}

test("same-first-name does not guess which Ravi was addressed", async () => {
  const { result, findings } = await analyze(TRAP_CHATS["same-first-name"]);
  const task = taskContaining(findings, "draft invoice");

  assert.ok(task, "the addressed task remains visible");
  assert.equal(task.owner, null);
  assert.equal(task.ownerBasis, "ambiguous");
  assert.equal(task.sourceReferenceStatus, "valid");
  assert.notEqual(task.owner, "Ravi Mehta");
  assert.notEqual(task.owner, "Ravi Shah");
  assert.doesNotMatch(JSON.stringify(result), /\b(?:missed|overdue)\b/iu);
});

test("a first name matching one speaker still resolves", async () => {
  const { findings } = await analyze([
    "Asha Verma: Nila, please review the draft.",
    "Nila Rao: I will review it.",
  ].join("\n"));

  assert.equal(taskContaining(findings, "review the draft")?.owner, "Nila");
});

test("a full name resolves despite another speaker sharing the first name", async () => {
  const { findings } = await analyze([
    "Asha Verma: Ravi K, please review the draft.",
    "Ravi K: I will review it.",
    "Ravi S: I am checking the invoice.",
  ].join("\n"));

  assert.equal(taskContaining(findings, "review the draft")?.owner, "Ravi K");
});

test("a later-speaking same-first-name participant still makes an earlier address ambiguous", async () => {
  const { findings } = await analyze([
    "Ravi K: I saw the latest draft.",
    "Asha Verma: Ravi, please review the draft.",
    "Ravi S: The budget sheet is in the shared folder.",
  ].join("\n"));

  const task = taskContaining(findings, "review the draft");
  assert.ok(task);
  assert.equal(task.owner, null);
  assert.equal(task.ownerBasis, "ambiguous");
});

test("a speaker's own commitment still identifies the claiming speaker", async () => {
  const { findings } = await analyze([
    "Ravi K: I'll update the draft invoice.",
    "Ravi S: I am checking the budget.",
  ].join("\n"));

  const task = taskContaining(findings, "update the draft invoice");
  assert.ok(task);
  assert.equal(task.owner, "Ravi K");
  assert.equal(task.classification, "self_commitment");
});

test("Hinglish first-name addresses are ambiguous with two matching speakers", async () => {
  const { findings } = await analyze([
    "Asha Verma: Ravi bhai, kal tak bhej dena.",
    "Ravi K: The latest invoice is in the shared folder.",
    "Ravi S: I saw the draft yesterday.",
  ].join("\n"));

  const task = taskContaining(findings, "kal tak bhej dena");
  assert.ok(task);
  assert.equal(task.owner, null);
  assert.equal(task.ownerBasis, "ambiguous");
});

test("Hinglish first-name address resolves when only one speaker matches", async () => {
  const { findings } = await analyze([
    "Asha Verma: Ravi bhai, kal tak bhej dena.",
    "Ravi K: I will send it.",
  ].join("\n"));

  assert.equal(taskContaining(findings, "kal tak bhej dena")?.owner, "Ravi");
});

test("English and Hinglish samples keep their unique named owners", async () => {
  const english = await analyze(SAMPLE_CHATS.english);
  const hinglish = await analyze(SAMPLE_CHATS.hinglish);

  assert.equal(taskContaining(english.findings, "update the executive deck")?.owner, "Maria");
  assert.equal(taskContaining(hinglish.findings, "GST invoice")?.owner, "Vikram");
});
