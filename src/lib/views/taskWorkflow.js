export const TASK_STATUSES = Object.freeze([
  "needs-review",
  "confirmed",
  "in-progress",
  "completed",
  "rejected",
]);

export const TASK_STATUS_LABELS = Object.freeze({
  "needs-review": "Needs human review",
  confirmed: "Confirmed by you",
  "in-progress": "Marked in progress",
  completed: "Marked completed",
  rejected: "Rejected by you",
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

function sameSourceReference(left, right) {
  if (!left || !right || !Number.isSafeInteger(left.startOffset) || !Number.isSafeInteger(left.endOffset)) return false;
  return left.startOffset === right.startOffset
    && left.endOffset === right.endOffset
    && (!left.snapshotId || !right.snapshotId || left.snapshotId === right.snapshotId)
    && (!left.messageId || !right.messageId || left.messageId === right.messageId);
}

export function promoteReviewCandidate(actions, candidate) {
  if (!candidate?.id) throw new TypeError("A review candidate ID is required.");
  const candidateText = String(candidate.text || candidate.sourceText || candidate.sourceEvidence?.quote || "").trim();
  if (!candidateText) throw new TypeError("A review candidate needs source text.");
  const sourceReference = candidate.sourceEvidence;
  const identitySourceReference = sourceReference || candidate.sourceSpan;
  const duplicate = (Array.isArray(actions) ? actions : []).some((task) => {
    return task.reviewCandidateId === candidate.id
      && sameSourceReference(task.reviewSourceReference || task.sourceEvidence || task.sourceSpan, identitySourceReference);
  });
  if (duplicate) return { duplicate: true, actions: Array.isArray(actions) ? actions : [] };
  const existingIds = new Set((Array.isArray(actions) ? actions : []).map((task) => task.id));
  const baseId = `promoted-${candidate.id}`;
  let taskId = baseId;
  for (let suffix = 2; existingIds.has(taskId); suffix += 1) {
    taskId = `${baseId}-${suffix}`;
  }
  const promoted = {
    id: taskId,
    text: candidateText,
    owner: null,
    classification: "user_confirmed_candidate",
    dueDate: null,
    resolvedDueDate: null,
    dueDateStatus: null,
    urgency: candidate.urgency || "Low",
    outcome: candidate.outcome || "possible",
    outcomeReason: candidate.outcomeReason || candidate.reasonLabel || "Extracted as a possible candidate",
    extractionOutcomeReason: candidate.outcomeReason || candidate.reasonLabel || "Extracted as a possible candidate",
    completed: false,
    lifecycleStatus: "open",
    lifecycleEvents: [],
    sourceSpan: candidate.sourceSpan || null,
    sourceEvidence: sourceReference || null,
    sourceReferenceStatus: candidate.sourceReferenceStatus || "unverified",
    semanticStatus: "human-confirmed",
    humanReviewStatus: "promoted",
    humanReviewEvidence: sourceReference || null,
    reviewCandidateId: candidate.id,
    reviewSourceReference: identitySourceReference || null,
    suggestedOwner: candidate.owner || null,
    suggestedDueDate: candidate.dueDate || null,
    suggestedResolvedDueDate: candidate.resolvedDueDate || null,
  };
  return { duplicate: false, actions: [...(Array.isArray(actions) ? actions : []), promoted] };
}

export function rejectReviewCandidate(decisions, candidateId, reviewedAt) {
  if (!candidateId) throw new TypeError("A review candidate ID is required.");
  if (typeof reviewedAt !== "string" || !reviewedAt) {
    throw new TypeError("A review timestamp is required.");
  }
  return {
    ...(decisions && typeof decisions === "object" ? decisions : {}),
    [candidateId]: { decision: "rejected", reviewedAt },
  };
}
