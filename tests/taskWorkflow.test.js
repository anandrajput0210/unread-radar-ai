import test from "node:test";
import assert from "node:assert/strict";

import {
  TASK_STATUSES,
  countTaskStatuses,
  getTaskStatus,
  updateTaskStatus,
} from "../src/lib/taskWorkflow.js";

test("newly extracted tasks start in needs-review", () => {
  assert.equal(getTaskStatus({}, "task-1"), "needs-review");
});

test("task status updates are immutable and only accept known values", () => {
  const original = { "task-1": "confirmed" };
  const updated = updateTaskStatus(original, "task-2", "in-progress");
  assert.deepEqual(original, { "task-1": "confirmed" });
  assert.deepEqual(updated, { "task-1": "confirmed", "task-2": "in-progress" });
  assert.throws(() => updateTaskStatus(updated, "task-3", "invented"), /Unsupported/);
  assert.throws(() => updateTaskStatus(updated, "", "completed"), /task ID/);
});

test("status counts include a needs-review default and ignore unknown status values", () => {
  const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const counts = countTaskStatuses(tasks, {
    b: "confirmed",
    c: "completed",
    d: "unknown",
  });
  assert.deepEqual(counts, {
    "needs-review": 2,
    confirmed: 1,
    "in-progress": 0,
    completed: 1,
    rejected: 0,
  });
  assert.deepEqual(Object.keys(counts), TASK_STATUSES);
});
