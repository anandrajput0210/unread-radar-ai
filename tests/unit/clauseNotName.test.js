import test from "node:test";
import assert from "node:assert/strict";
import { analyzeConversations } from "../../src/lib/extraction/index.js";

const run = (t) => analyzeConversations(`[10:00, 02/11/2026] Sam: ${t}`).actions;

// Each case must EXTRACT exactly one task (never silently drop it), leave it ownerless,
// keep the task text, and keep the clause as a condition or deadline.
const CASES = [
  ["Once it's done, ping me.", "ping me", { condition: "Once it's done" }],
  ["When you're free, call me.", "call me", { condition: "When you're free" }],
  ["After lunch, send the file.", "send the file", { condition: "After lunch" }],
  ["If QA signs off, deploy it.", "deploy it", { condition: "If QA signs off" }],
  ["Before Friday, send the invoice.", "send the invoice", { deadline: "Friday" }],
  ["Later today, call the client.", "call the client", {}],
];

for (const [message, text, expect] of CASES) {
  test(`leading clause is not an owner, task kept: ${message}`, () => {
    const actions = run(message);
    assert.equal(actions.length, 1, "task must be extracted, not dropped");
    assert.equal(actions[0].owner, null);
    assert.equal(actions[0].text, text);
    if (expect.condition) assert.equal(actions[0].condition, expect.condition);
    if (expect.deadline) assert.equal(actions[0].dueDate, expect.deadline);
  });
}

test("real named addressees still work", () => {
  const a = run("Priya, please send the invoice.");
  assert.equal(a.length, 1);
  assert.equal(a[0].owner, "Priya");
  const b = run("Mary Ann, can you call the vendor?");
  assert.equal(b.length, 1);
  assert.equal(b[0].owner, "Mary Ann");
});


test("May and Will remain valid person names when used as explicit addressees", () => {
  for (const name of ["May", "Will"]) {
    const actions = run(`${name}, please send the invoice.`);
    assert.equal(actions.length, 1, `${name} should yield exactly one task`);
    assert.equal(actions[0].owner, name);
    assert.equal(actions[0].text, "send the invoice");
  }
});

test("a leading discourse marker is not treated as a person's name", () => {
  const actions = run("Also, update the testing notes.");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].owner, null);
  assert.equal(actions[0].text, "update the testing notes");
});
