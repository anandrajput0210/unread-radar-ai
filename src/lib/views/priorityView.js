const URGENCY_LEVELS = Object.freeze(["High", "Medium", "Low"]);
const URGENCY_RANK = Object.freeze({ High: 3, Medium: 2, Low: 1 });

function sourceRecordKey(item) {
  const evidence = item?.sourceEvidence;
  if (typeof evidence?.messageId === "string" && evidence.messageId) {
    return `message:${evidence.messageId}`;
  }
  const span = item?.sourceSpan;
  if (Number.isSafeInteger(span?.startOffset) && Number.isSafeInteger(span?.endOffset)) {
    return `span:${span.startOffset}:${span.endOffset}`;
  }
  return null;
}

function strongestUrgency(items) {
  return items.reduce((current, item) => {
    const candidate = URGENCY_RANK[item?.urgency] ? item.urgency : "Low";
    return URGENCY_RANK[candidate] > URGENCY_RANK[current] ? candidate : current;
  }, "Low");
}

/**
 * Creates a task-first priority view. Deadlines, urgency rows and mentions
 * from the same recognized source message are attached as supporting context
 * instead of being counted again as separate priority items.
 *
 * If a finding has no trustworthy message/span identity, it is not guessed
 * onto a task; it remains a standalone source signal.
 */
export function buildPriorityView(analysis = {}) {
  const actions = Array.isArray(analysis.actions) ? analysis.actions : [];
  const signals = [
    ...(Array.isArray(analysis.deadlines) ? analysis.deadlines : []).map((item) => ({ ...item, kind: "Deadline" })),
    ...(Array.isArray(analysis.urgentRows) ? analysis.urgentRows : []).map((item) => ({ ...item, kind: "Urgent message" })),
    ...(Array.isArray(analysis.mentions) ? analysis.mentions : []).map((item) => ({
      ...item,
      text: `@${item.handle} mentioned: ${item.line}`,
      kind: "Mention",
    })),
  ];

  const taskKeys = new Set(actions.map(sourceRecordKey).filter(Boolean));
  const linkedSignalsByTaskKey = new Map();
  const standaloneGroups = new Map();
  let linkedSignalCount = 0;

  for (const signal of signals) {
    const key = sourceRecordKey(signal);
    if (key && taskKeys.has(key)) {
      const items = linkedSignalsByTaskKey.get(key) || [];
      items.push(signal);
      linkedSignalsByTaskKey.set(key, items);
      linkedSignalCount += 1;
      continue;
    }

    // Group multiple categories from one unlinked message into one source
    // signal, so a deadline and urgency marker do not inflate the item count.
    const groupKey = key || `unmatched:${signal.kind}:${String(signal.text || "").toLocaleLowerCase()}`;
    const group = standaloneGroups.get(groupKey) || {
      id: `signal:${groupKey}`,
      type: "signal",
      kind: "Source signal",
      text: signal.text || signal.line || "Unlabeled source signal",
      urgency: "Low",
      signals: [],
      sourceEvidence: signal.sourceEvidence || null,
      sourceReferenceStatus: signal.sourceReferenceStatus || "unverified",
    };
    group.signals.push(signal);
    if ((URGENCY_RANK[signal.urgency] || 1) > (URGENCY_RANK[group.urgency] || 1)) {
      group.urgency = signal.urgency;
    }
    if (!group.sourceEvidence && signal.sourceEvidence) group.sourceEvidence = signal.sourceEvidence;
    standaloneGroups.set(groupKey, group);
  }

  const tasks = actions.map((action) => {
    const key = sourceRecordKey(action);
    return {
      ...action,
      type: "task",
      kind: "Action item",
      linkedSignals: key ? (linkedSignalsByTaskKey.get(key) || []) : [],
    };
  });
  const standaloneSignals = [...standaloneGroups.values()];
  const priorityItems = [...tasks, ...standaloneSignals];
  const counts = Object.fromEntries(URGENCY_LEVELS.map((level) => [
    level,
    priorityItems.filter((item) => item.urgency === level).length,
  ]));
  const taskCounts = Object.fromEntries(URGENCY_LEVELS.map((level) => [
    level,
    tasks.filter((item) => item.urgency === level).length,
  ]));

  return {
    tasks,
    standaloneSignals,
    priorityItems,
    counts,
    taskCounts,
    uniqueTaskCount: tasks.length,
    standaloneSignalCount: standaloneSignals.length,
    uniquePriorityCount: priorityItems.length,
    linkedSignalCount,
    supportingSignalCounts: {
      deadlines: signals.filter((item) => item.kind === "Deadline" && taskKeys.has(sourceRecordKey(item))).length,
      urgentMessages: signals.filter((item) => item.kind === "Urgent message" && taskKeys.has(sourceRecordKey(item))).length,
      mentions: signals.filter((item) => item.kind === "Mention" && taskKeys.has(sourceRecordKey(item))).length,
    },
  };
}

export { sourceRecordKey };
