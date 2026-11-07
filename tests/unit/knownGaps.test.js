import test from "node:test";
import assert from "node:assert/strict";
import { analyzeConversations } from "../../src/lib/extraction/index.js";

const analyze = (lines) => analyzeConversations(lines.join("\n"));
const actions = (lines) => analyze(lines).actions;

test('"Amit tum dono dekh lo" stays unassigned because the instruction is shared', () => {
  const result = analyze([
    "[13:00, 04/11/2026] Rahul: dekh bhai, client ka call aaya tha, unko revised quote chahiye aur delivery timeline bhi, Amit tum dono dekh lo please, kal subah tak bhej dena",
    "[13:05, 04/11/2026] Amit: ok bhai",
  ]);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].owner, null);
  assert.equal(result.actions[0].outcome, "confirmed");
  assert.equal(result.actions[0].classification, "unassigned_action");
  assert.equal(result.actions[0].resolvedDueDate, "2026-11-05");
});

test("a defect complaint is a possible unassigned follow-up, not an automatic owner claim", () => {
  const result = analyze(["[10:00, 05/11/2026] Client: Also, the logo files you sent are corrupted."]);
  assert.equal(result.actions.length, 1);
  assert.match(result.actions[0].text, /logo files/i);
  assert.equal(result.actions[0].owner, null);
  assert.equal(result.actions[0].outcome, "possible");
  assert.match(result.actions[0].outcomeReason, /defect|remediation|review/i);
});

test("an already-resolved defect complaint does not create a repair task", () => {
  const result = analyze([
    "[10:00, 05/11/2026] Client: The logo files you sent are corrupted, but we already replaced them.",
  ]);
  assert.equal(result.actions.length, 0);
});

test("a stale defect complaint cannot be claimed by a later repair fragment", () => {
  const result = analyze([
    "[10:00, 05/11/2026] Client: The logo files you sent are corrupted.",
    "[10:01, 05/11/2026] Client: The meeting moved to Friday.",
    "[10:02, 05/11/2026] Client: Lunch is at one.",
    "[10:03, 05/11/2026] Client: Thanks for confirming.",
    "[10:04, 05/11/2026] Vikram: Sorry about that, resending now.",
  ]);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].owner, null);
  assert.equal(result.actions[0].outcome, "possible");
});

test("a complaint without an identifiable requester cannot transfer ownership", () => {
  const result = analyze([
    "The logo files you sent are corrupted.",
    "Vikram: Sorry about that, resending now.",
  ]);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].owner, null);
  assert.equal(result.actions[0].outcome, "possible");
});

test("a direct repair commitment links to the unique recent defect complaint", () => {
  const result = analyze([
    "[10:00, 05/11/2026] Client: Could you send over the updated proposal by Monday?",
    "[10:05, 05/11/2026] Vikram: Yes, I'll have it with you on Monday morning.",
    "[10:06, 05/11/2026] Client: Also, the logo files you sent are corrupted.",
    "[10:08, 05/11/2026] Vikram: Sorry about that, resending now.",
  ]);
  assert.equal(result.actions.length, 2);
  const logo = result.actions.find((task) => /logo files/i.test(task.text));
  assert.ok(logo);
  assert.equal(logo.owner, "Vikram");
  assert.equal(logo.outcome, "confirmed");
  assert.ok(logo.supportingDetails.some((detail) => /resending now/i.test(detail.text)));
});

test("a repair commitment without a recent identifiable complaint does not invent a task or owner", () => {
  const result = analyze([
    "[10:00, 05/11/2026] Vikram: Sorry about that, resending now.",
  ]);
  assert.equal(result.actions.length, 0);
});

test('"Once QA signs off, deploy it" is a confirmed unassigned task with a pending condition', () => {
  const result = analyze([
    "[17:10, 05/11/2026] Lead: Once QA signs off, deploy it. Nobody should touch the config until then.",
  ]);
  assert.equal(result.actions.length, 1);
  const [task] = result.actions;
  assert.match(task.text, /^deploy it$/i);
  assert.equal(task.owner, null);
  assert.equal(task.outcome, "confirmed");
  assert.equal(task.condition, "Once QA signs off");
  assert.equal(task.conditionStatus, "pending_verification");
});

test("a later QA sign-off satisfies the condition and a unique recent deployment progress update claims the task", () => {
  const result = analyze([
    "[17:10, 05/11/2026] Lead: Once QA signs off, deploy it. Nobody should touch the config until then.",
    "[17:20, 05/11/2026] QA: Signed off.",
    "[17:21, 05/11/2026] Dev: Deploying now.",
  ]);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].owner, "Dev");
  assert.equal(result.actions[0].ownerSource, "claimed_by_progress");
  assert.equal(result.actions[0].lifecycleStatus, "in-progress");
  assert.equal(result.actions[0].conditionStatus, "reported_satisfied");
});

test("conditional questions and prohibited deployments must not become tasks", () => {
  assert.equal(actions(["[17:10, 05/11/2026] Lead: If QA signs off, should we deploy it?"]).length, 0);
  assert.equal(actions(["[17:10, 05/11/2026] Lead: Once QA signs off, do not deploy it."]).length, 0);
});

test("a clock time for an event is not a task deadline, while an explicit by-time is", () => {
  const event = actions(["[10:00, 02/11/2026] Boss: Can someone take the vendor call at 4?"])[0];
  assert.ok(event);
  assert.equal(event.dueDate, null);
  assert.equal(event.resolvedDueDate, null);

  const deadline = actions(["[10:00, 02/11/2026] Boss: Please send the vendor report by 4 pm."])[0];
  assert.equal(deadline.dueDate, "4 pm");
});
