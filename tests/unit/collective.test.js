import test from "node:test";
import assert from "node:assert/strict";
import { analyzeConversations } from "../../src/lib/extraction/index.js";

const run = (body, speaker = "Anita") => analyzeConversations(`[10:00, 02/11/2026] ${speaker}: ${body}`).actions;
const only = (body) => { const a = run(body); assert.equal(a.length, 1, `expected one task for "${body}", got ${a.length}`); return a[0]; };

test("collective obligations (need/have to/must) are confirmed tasks with no owner", () => {
  for (const body of [
    "We need to finalize the roadmap.",
    "We have to submit the report.",
    "We must send the revised quote to the client by tomorrow.",
    "Guys, we need to get the vendor agreements signed before the audit on Monday.",
  ]) {
    const a = only(body);
    assert.equal(a.owner, null, body);
    assert.equal(a.classification, "collective_task", body);
    assert.equal(a.outcome, "confirmed", body);
  }
});

test("collective obligation keeps its deadline", () => {
  assert.equal(only("We have to submit the compliance report by Friday.").resolvedDueDate, "2026-11-06");
});

test("'let's' and 'we should' are proposals: possible, never confirmed", () => {
  for (const body of ["We should prepare the presentation.", "Let's finish the deck.", "We should probably update the onboarding guide at some point."]) {
    const a = only(body);
    assert.equal(a.outcome, "possible", body);
    assert.equal(a.owner, null, body);
  }
});

test("'Team, let's complete X by <day>' carries a deadline and is a collective task", () => {
  const a = only("Team, let's complete the deployment by Thursday.");
  assert.equal(a.resolvedDueDate, "2026-11-05");
  assert.equal(a.owner, null);
});

test("hypotheticals, questions, decisions, negations and past tense are not tasks", () => {
  for (const body of [
    "If we need to finalize the roadmap early, I'll let you know.",
    "We might need to submit the report next month.",
    "Do we need to update the slides?",
    "What if we have to rebuild the whole pipeline?",
    "We decided to postpone the launch to next quarter.",
    "We've decided to go with the second vendor.",
    "We agreed to meet on Friday.",
    "We need to decide on pricing.",
    "We need to talk about budget tomorrow.",
    "We don't need to submit the report anymore.",
    "We already finalized the roadmap last week.",
    "We had to redo the slides yesterday, but it's done now.",
    "Then we'd need to postpone the release.",
  ]) assert.equal(run(body).length, 0, body);
});

test("Hinglish collective obligation is found without an owner", () => {
  const a = only("humein roadmap finalize karna hai");
  assert.equal(a.owner, null);
});

test("'I'll push the hotfix tonight' is a self-commitment due today", () => {
  const a = only("I'll push the hotfix tonight.");
  assert.equal(a.owner, "Anita");
  assert.equal(a.resolvedDueDate, "2026-11-02");
});

test("one message with two requests yields two tasks", () => {
  assert.equal(run("Please send the invoice and update the tracker by Friday.").length, 2);
});
