import test from "node:test";
import assert from "node:assert/strict";
import { analyzeConversations } from "../../src/lib/extraction/index.js";

const chat = (...lines) => lines.map((line, i) => `[10:${String(i).padStart(2, "0")}, 03/11/2026] ${line}`).join("\n");
const tasks = (...lines) => analyzeConversations(chat(...lines)).actions;

test("an explicit request is Confirmed", () => {
  const [task] = tasks("Boss: Priya, please send the quote by Friday.");
  assert.equal(task.outcome, "confirmed");
  assert.equal(task.outcomeReason, null);
  assert.equal(task.owner, "Priya");
});

test("a suggestion without a request marker is only Possible", () => {
  const [task] = tasks("Boss: We should call the vendor about delivery.");
  assert.equal(task.outcome, "possible");
});

test("an implied need is Possible and names no owner", () => {
  const [task] = tasks("Client: We need the revised brochure by Friday.");
  assert.equal(task.outcome, "possible");
  assert.equal(task.owner, null);
  assert.equal(task.resolvedDueDate, "2026-11-06");
});

test("'Can someone take the vendor call' is a Confirmed unassigned request", () => {
  const [task] = tasks("Boss: Can someone take the vendor call at 4?");
  assert.equal(task.outcome, "confirmed");
  assert.equal(task.classification, "unassigned_request");
  assert.equal(task.owner, null);
});

test("a bare 'kar dunga' acknowledges the speaker's single earlier task instead of creating another", () => {
  const found = tasks("Rahul: Amit bhai, kal tak quotation bhej dena.", "Amit: haan bhai, kar dunga");
  assert.equal(found.length, 1);
  assert.equal(found[0].owner, "Amit");
  assert.equal(found[0].outcome, "confirmed");
});

test("a bare commitment with no earlier task is Possible, not Confirmed", () => {
  const [task] = tasks("Rohit: haan bhai, kar dunga");
  assert.equal(task.outcome, "possible");
});

test("Hinglish prohibitions and jokes never create tasks", () => {
  assert.equal(tasks("Rahul: invoice mat bhejna abhi, client ne hold pe rakha hai").length, 0);
  assert.equal(tasks("Amit: kal tak sab ho jayega haha just joking 😂").length, 0);
});

test("Devanagari request and commitment are found and linked", () => {
  const found = tasks("राहुल: अमित, कल तक कोटेशन भेज देना।", "अमित: ठीक है, कर दूंगा।");
  assert.equal(found.length, 1);
  assert.equal(found[0].owner, "अमित");
  assert.equal(found[0].resolvedDueDate, "2026-11-04");
});

test("'<work> ab <Name> karega' creates a task only when no earlier task covers that work", () => {
  assert.equal(tasks("Rahul: Banner ka kaam ab Rohan karega")[0].owner, "Rohan");
  const again = tasks("Anand: Neha, please finalise the homepage banner by Friday.", "Anand: Banner ka kaam ab Rohan karega");
  assert.equal(again.length, 1, "handled as a reassignment, not a second task");
});
