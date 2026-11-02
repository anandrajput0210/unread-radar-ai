export const TASK_STATUSES = Object.freeze([
  "needs-review",
  "confirmed",
  "in-progress",
  "completed",
  "rejected",
]);

export const TASK_STATUS_LABELS = Object.freeze({
  "needs-review": "Needs review",
  confirmed: "Confirmed",
  "in-progress": "In progress",
  completed: "Completed",
  rejected: "Rejected",
});

export function getTaskStatus(statuses, taskId) {
  const value = statuses && typeof statuses === "object" ? statuses[taskId] : null;
  return TASK_STATUSES.includes(value) ? value : "needs-review";
}

export function countTaskStatuses(tasks, statuses) {
  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0]));
  for (const task of Array.isArray(tasks) ? tasks : []) {
    counts[getTaskStatus(statuses, task?.id)] += 1;
  }
  return counts;
}

export function updateTaskStatus(statuses, taskId, nextStatus) {
  if (typeof taskId !== "string" || !taskId.trim()) {
    throw new TypeError("A task ID is required to update its review status.");
  }
  if (!TASK_STATUSES.includes(nextStatus)) {
    throw new TypeError("Unsupported task review status.");
  }
  return { ...(statuses && typeof statuses === "object" ? statuses : {}), [taskId]: nextStatus };
}
