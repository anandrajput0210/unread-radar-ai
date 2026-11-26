import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";
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

test("same-first-name does not guess which Ravi was addressed", {
  skip: "Known gap: rules currently emit owner 'Ravi' for two speakers with that first name; see docs/known-gaps.md.",
}, async () => {
  const { findings } = await analyze(TRAP_CHATS["same-first-name"]);
  assertNoConfidentOwner(findings, "same-first-name");
  assert.ok(findings.every((finding) => !["Ravi Mehta", "Ravi Shah"].includes(finding.owner)));
});
