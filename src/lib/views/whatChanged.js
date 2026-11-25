function analysisOf(session) {
  return session?.analysis && typeof session.analysis === "object" ? session.analysis : session || {};
}

function tasksOf(session) {
  const actions = analysisOf(session).actions;
  return Array.isArray(actions) ? actions : [];
}

function sourceReferenceOf(task) {
  return task?.sourceEvidence || task?.sourceSpan || null;
}

function messageIndexOf(task, session) {
  const reference = sourceReferenceOf(task);
  if (Number.isSafeInteger(reference?.messageIndex) && reference.messageIndex >= 0) {
    return reference.messageIndex;
  }
  const startOffset = reference?.startOffset;
  const endOffset = reference?.endOffset;
  if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset)) return null;

  const ranges = Array.isArray(session?.sourceMessageRanges) ? session.sourceMessageRanges : [];
  const index = ranges.findIndex((range) => Number.isSafeInteger(range?.startOffset)
    && Number.isSafeInteger(range?.endOffset)
    && startOffset >= range.startOffset
    && endOffset <= range.endOffset);
  return index < 0 ? null : index;
}

function evidenceIdentity(task, session) {
  const reference = sourceReferenceOf(task);
  const quote = typeof reference?.quote === "string" ? reference.quote : "";
  const messageIndex = messageIndexOf(task, session);
  if (!quote || messageIndex === null) return null;
  return JSON.stringify([quote, messageIndex]);
}

function groupedTasks(session) {
  const groups = new Map();
  for (const task of tasksOf(session)) {
    const identity = evidenceIdentity(task, session);
    if (!identity) continue;
    const group = groups.get(identity) || [];
    group.push(task);
    groups.set(identity, group);
  }
  return groups;
}

function ownerValue(task) {
  return typeof task?.owner === "string" && task.owner.trim() ? task.owner.trim() : null;
}

function dueValue(task) {
  return {
    dueDate: typeof task?.dueDate === "string" && task.dueDate.trim() ? task.dueDate.trim() : null,
    resolvedDueDate: typeof task?.resolvedDueDate === "string" && task.resolvedDueDate.trim()
      ? task.resolvedDueDate.trim()
      : null,
    status: typeof task?.dueDateStatus === "string" ? task.dueDateStatus : null,
  };
}

function resolutionEvent(task) {
  const events = Array.isArray(task?.lifecycleEvents) ? task.lifecycleEvents : [];
  return events.find((event) => event?.type === "completed" || event?.type === "cancelled") || null;
}

function taskEntry(task, session) {
  const reference = sourceReferenceOf(task);
  return {
    task,
    quote: typeof reference?.quote === "string" ? reference.quote : "",
    messageIndex: messageIndexOf(task, session),
  };
}

export function diffSessions(previous, current) {
  const previousGroups = groupedTasks(previous);
  const currentGroups = groupedTasks(current);
  const matchedCurrent = new Set();
  const result = {
    newTasks: [],
    resolvedTasks: [],
    changedOwner: [],
    changedDue: [],
    unchanged: 0,
  };

  for (const [identity, currentGroup] of currentGroups) {
    const previousGroup = previousGroups.get(identity) || [];
    if (currentGroup.length !== 1 || previousGroup.length !== 1) continue;

    const currentTask = currentGroup[0];
    const previousTask = previousGroup[0];
    matchedCurrent.add(currentTask);
    const entry = taskEntry(currentTask, current);
    const oldOwner = ownerValue(previousTask);
    const newOwner = ownerValue(currentTask);
    const oldDue = dueValue(previousTask);
    const newDue = dueValue(currentTask);
    let changed = false;

    if (oldOwner !== newOwner) {
      result.changedOwner.push({
        ...entry,
        previousTask,
        oldValue: oldOwner,
        newValue: newOwner,
      });
      changed = true;
    }

    if (JSON.stringify(oldDue) !== JSON.stringify(newDue)) {
      result.changedDue.push({
        ...entry,
        previousTask,
        oldValue: oldDue,
        newValue: newDue,
      });
      changed = true;
    }

    const currentResolution = resolutionEvent(currentTask);
    const previousResolution = resolutionEvent(previousTask);
    if (currentResolution && !previousResolution) {
      result.resolvedTasks.push({
        ...entry,
        lifecycleType: currentResolution.type,
        lifecycleQuote: typeof currentResolution.text === "string"
          ? currentResolution.text
          : typeof currentResolution.evidence?.quote === "string" ? currentResolution.evidence.quote : "",
      });
      changed = true;
    }
    if (!changed) result.unchanged += 1;
  }

  for (const task of tasksOf(current)) {
    if (matchedCurrent.has(task)) continue;
    const identity = evidenceIdentity(task, current);
    if (identity) {
      const currentGroup = currentGroups.get(identity) || [];
      const previousGroup = previousGroups.get(identity) || [];
      result.newTasks.push({
        ...taskEntry(task, current),
        possiblySame: currentGroup.length > 1 || previousGroup.length > 0,
      });
    }
  }

  return result;
}
