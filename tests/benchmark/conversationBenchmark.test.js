import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeConversations } from "../../src/lib/extraction/index.js";

const fixtures = JSON.parse(await readFile(new URL("../fixtures/conversation-benchmark.json", import.meta.url), "utf8"));

assert.equal(fixtures.length, 20, "The synthetic conversation regression corpus must contain exactly 20 fixtures.");

for (const fixture of fixtures) {
  test(`20-case conversation regression: ${fixture.id}`, () => {
    const result = analyzeConversations(fixture.text);
    assert.equal(result.actions.length, fixture.actionCount, fixture.description);

    if (Object.hasOwn(fixture, "firstOwner")) {
      assert.equal(result.actions[0]?.owner ?? null, fixture.firstOwner, fixture.description);
    }
    if (fixture.firstClassification) {
      assert.equal(result.actions[0]?.classification, fixture.firstClassification, fixture.description);
    }
    if (fixture.firstDueDate) {
      assert.equal(result.actions[0]?.dueDate, fixture.firstDueDate, fixture.description);
    }
    if (fixture.firstDueDateStatus) {
      assert.equal(result.actions[0]?.dueDateStatus, fixture.firstDueDateStatus, fixture.description);
    }
    if (fixture.firstUrgency) {
      assert.equal(result.actions[0]?.urgency, fixture.firstUrgency, fixture.description);
    }
    if (fixture.owners) {
      assert.deepEqual(result.actions.map((item) => item.owner), fixture.owners, fixture.description);
    }
    if (Object.hasOwn(fixture, "urgentRowCount")) {
      assert.equal(result.urgentRows.length, fixture.urgentRowCount, fixture.description);
    }
    if (Object.hasOwn(fixture, "decisionCount")) {
      assert.equal(result.decisions.length, fixture.decisionCount, fixture.description);
    }
  });
}
