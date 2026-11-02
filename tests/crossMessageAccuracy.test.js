import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeConversations } from "../src/lib/conversationParser.js";
import { buildSourceGroundedSummary } from "../src/lib/sourceGroundedSummary.js";

async function fixture(name) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}


test("source summary classifies a condition update and a task commitment on the same line", async () => {
  const input = await fixture("accuracy-chat-3-meeting-followups.txt");
  const findings = analyzeConversations(input);
  const summary = buildSourceGroundedSummary(findings);
  assert.ok(summary.some((line) => /Dual-role line \(condition reported satisfied \+ task commitment\)/i.test(line) && /Legal approved the wording/i.test(line)));
  assert.ok(summary.some((line) => /Decision-pattern line/i.test(line) && /training will be remote/i.test(line)));
});

test("product launch: owner assignments, self-commitment, repeated acknowledgement and decision are kept distinct", async () => {
  const input = await fixture("accuracy-chat-1-product-launch.txt");
  const result = analyzeConversations(input);
  assert.equal(result.actions.length, 3);

  const screenshots = result.actions.find((item) => /revised screenshots/i.test(item.text));
  assert.ok(screenshots);
  assert.equal(screenshots.owner, "Daniel");
  assert.equal(screenshots.dueDate, "Thursday, 4 PM");
  assert.equal(screenshots.dueDateStatus, "explicit");
  assert.equal(screenshots.acknowledgedBy, "Daniel Kim");
  assert.ok(screenshots.supportingDetails.some((item) => /upload the screenshots/i.test(item.text)));

  const pricing = result.actions.find((item) => /pricing section/i.test(item.text));
  assert.ok(pricing);
  assert.equal(pricing.owner, "Elena Ruiz");
  assert.equal(pricing.classification, "self_commitment");

  const quote = result.actions.find((item) => /vendor quote/i.test(item.text));
  assert.ok(quote);
  assert.equal(quote.owner, "Priya");
  assert.equal(quote.dueDate, "tomorrow");
  assert.equal(quote.dueDateStatus, "explicit");
  assert.equal(quote.acknowledgedBy, "Priya Nair");

  assert.equal(result.decisions.length, 1);
  assert.match(result.decisions[0], /publish the launch page/i);
  assert.equal(result.actions.some((item) => /old FAQ/i.test(item.text)), false);
  assert.equal(result.deadlines.some((item) => /old FAQ|12 November/i.test(item.text)), false);
});

test("incident response: first-person commitments, task refinements, acknowledgement and meeting-time exclusion", async () => {
  const input = await fixture("accuracy-chat-2-incident-response.txt");
  const result = analyzeConversations(input);
  assert.equal(result.actions.length, 2);

  const raj = result.actions.find((item) => /inspect the logs/i.test(item.text));
  assert.ok(raj);
  assert.equal(raj.owner, "Raj Mehta");
  assert.equal(raj.dueDate, "3 PM");
  assert.equal(raj.dueDateStatus, "explicit");
  assert.ok(raj.supportingDetails.some((item) => /affected endpoints/i.test(item.text)));
  assert.ok(raj.supportingDetails.some((item) => /attach the log excerpt/i.test(item.text)));

  const sam = result.actions.find((item) => /rotate the staging API secret/i.test(item.text));
  assert.ok(sam);
  assert.equal(sam.owner, "Sam");
  assert.equal(sam.dueDate, "8 PM");
  assert.equal(sam.dueDateStatus, "explicit");
  assert.equal(sam.acknowledgedBy, "Sam Brooks");

  assert.equal(result.actions.some((item) => /restart production/i.test(item.text)), false);
  assert.equal(result.deadlines.some((item) => /rollback review/i.test(item.text)), false);
  assert.equal(result.deadlines.length, 2);
  assert.equal(result.decisions.length, 0);
});

test("meeting follow-ups: unassigned request, Bella's owned work, conditions, legal approval and decision", async () => {
  const input = await fixture("accuracy-chat-3-meeting-followups.txt");
  const result = analyzeConversations(input);
  assert.equal(result.actions.length, 4);

  const proposal = result.actions.find((item) => /revised proposal/i.test(item.text));
  assert.ok(proposal);
  assert.equal(proposal.owner, null);
  assert.equal(proposal.classification, "unassigned_request");
  assert.equal(proposal.dueDate, "Friday");

  const training = result.actions.find((item) => /training schedule/i.test(item.text));
  assert.ok(training);
  assert.equal(training.owner, "Bella Martin");
  assert.equal(training.dueDate, "Wednesday noon");
  assert.equal(training.dueDateStatus, "explicit");

  const tracker = result.actions.find((item) => /project tracker/i.test(item.text));
  assert.ok(tracker);
  assert.equal(tracker.owner, "Bella");
  assert.equal(tracker.condition, "once the client responds");
  assert.equal(tracker.acknowledgedBy, "Bella Martin");

  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.owner, "Chris Wong");
  assert.equal(supplier.dueDate, "tomorrow morning");
  assert.equal(supplier.dueDateStatus, "explicit");
  assert.equal(supplier.condition, "until Legal approves the wording");
  assert.equal(supplier.conditionStatus, "reported_satisfied");
  assert.ok(supplier.supportingDetails.some((item) => /won't contact the supplier until Legal approves/i.test(item.text)));

  assert.equal(result.decisions.length, 1);
  assert.match(result.decisions[0], /training will be remote/i);
  assert.equal(result.actions.some((item) => /room booking/i.test(item.text)), false);
  assert.equal(result.actions.some((item) => item.dueDate === "2026-11-30"), false);
});

test("conditional state: approval reported after the task commitment resolves the prerequisite with exact evidence", () => {
  const input = [
    "[09:00, 06/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
    "[09:10, 06/11/2026] Chris Wong: I'll contact the supplier tomorrow morning and share the delivery estimate.",
    "[09:15, 06/11/2026] Legal: Legal approved the wording.",
  ].join("\n");
  const result = analyzeConversations(input);
  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.conditionStatus, "reported_satisfied");
  assert.ok(supplier.supportingDetails.some((item) => item.kind === "condition-resolution:reported_satisfied" && /Legal approved the wording/i.test(item.text)));
});

test("conditional state: an explicit rejection is not mislabeled as satisfaction", () => {
  const input = [
    "[09:00, 06/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
    "[09:10, 06/11/2026] Legal: Legal rejected the wording.",
    "[09:15, 06/11/2026] Chris Wong: I'll contact the supplier only after the wording is approved.",
  ].join("\n");
  const result = analyzeConversations(input);
  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.conditionStatus, "reported_rejected");
  assert.ok(supplier.supportingDetails.some((item) => item.kind === "condition-resolution:reported_rejected"));
});

test("conditional state: contradictory approval and rejection evidence remains ambiguous", () => {
  const input = [
    "[09:00, 06/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
    "[09:05, 06/11/2026] Legal: Legal approved the wording.",
    "[09:10, 06/11/2026] Legal: Legal rejected the wording after review.",
    "[09:15, 06/11/2026] Chris Wong: I'll contact the supplier tomorrow morning.",
  ].join("\n");
  const result = analyzeConversations(input);
  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.conditionStatus, "ambiguous");
  assert.equal(supplier.supportingDetails.filter((item) => item.kind.startsWith("condition-resolution:")).length, 2);
});


test("conditional state: an explicit later revocation supersedes an earlier approval", () => {
  const input = [
    "[09:00, 06/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
    "[09:05, 06/11/2026] Legal: Legal approved the wording.",
    "[09:10, 06/11/2026] Legal: Correction: the approval was revoked after the compliance review.",
    "[09:15, 06/11/2026] Chris Wong: I'll contact the supplier only when approval is valid.",
  ].join("\n");
  const result = analyzeConversations(input);
  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.conditionStatus, "reported_rejected");
  assert.ok(supplier.supportingDetails.some((item) => item.kind === "condition-resolution:superseded:reported_satisfied" && /Legal approved the wording/i.test(item.text)));
  assert.ok(supplier.supportingDetails.some((item) => item.kind === "condition-resolution:reported_rejected" && /approval was revoked/i.test(item.text)));
});



test("cross-speaker condition resolution: correction that approval is withdrawn supersedes Legal's earlier approval", () => {
  const input = [
    "[09:00, 05/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
    "[09:05, 05/11/2026] Legal Reviewer: Legal approves the wording.",
    "[09:10, 05/11/2026] Chris Wong: I'll contact the supplier tomorrow morning.",
    "[09:20, 05/11/2026] Legal Reviewer: Correction: approval is withdrawn. The wording still needs changes.",
  ].join("\n");
  const result = analyzeConversations(input);
  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.conditionStatus, "reported_rejected");
  assert.ok(supplier.supportingDetails.some((item) => item.kind === "condition-resolution:superseded:reported_satisfied" && /Legal approves the wording/i.test(item.text)));
  assert.ok(supplier.supportingDetails.some((item) => item.kind === "condition-resolution:reported_rejected" && /approval is withdrawn/i.test(item.text)));
});

test("cross-speaker condition resolution: Legal approval and Compliance not-approved statement remain ambiguous", () => {
  const input = [
    "[09:00, 05/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
    "[09:05, 05/11/2026] Legal Reviewer: Legal approves the wording.",
    "[09:12, 05/11/2026] Compliance Reviewer: The wording has not been approved.",
    "[09:20, 05/11/2026] Chris Wong: I'll contact the supplier tomorrow morning.",
  ].join("\n");
  const result = analyzeConversations(input);
  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.conditionStatus, "ambiguous");
  assert.ok(supplier.supportingDetails.some((item) => item.kind === "condition-resolution:reported_satisfied" && /Legal approves the wording/i.test(item.text)));
  assert.ok(supplier.supportingDetails.some((item) => item.kind === "condition-resolution:reported_rejected" && /has not been approved/i.test(item.text)));
});

test("conditional state: no resolution message leaves the prerequisite pending", () => {
  const input = [
    "[09:00, 06/11/2026] Chris Wong: I won't contact the supplier until Legal approves the wording.",
    "[09:15, 06/11/2026] Chris Wong: I'll contact the supplier once Legal approves the wording.",
  ].join("\n");
  const result = analyzeConversations(input);
  const supplier = result.actions.find((item) => /contact the supplier/i.test(item.text));
  assert.ok(supplier);
  assert.equal(supplier.conditionStatus, "pending_verification");
});
