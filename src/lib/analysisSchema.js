export const URGENCY_LEVELS = Object.freeze(["High", "Medium", "Low"]);

export function createEmptyAnalysis() {
  return {
    summary: [],
    actions: [],
    decisions: [],
    deadlines: [],
    mentions: [],
    urgentRows: [],
    alerts: [],
    lineCount: 0,
    sourceChunks: 0,
    modelId: "",
  };
}

function textValue(value, maxLength = 5000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function listValue(value) {
  return Array.isArray(value) ? value : [];
}

function urgencyValue(value) {
  if (!URGENCY_LEVELS.includes(value)) {
    throw new Error("The local model returned an unsupported urgency level. Retry the analysis.");
  }
  return value;
}

function confidenceValue(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : null;
}

function stableId(prefix, index, text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${index}-${(hash >>> 0).toString(36)}`;
}

function normalizeMention(item) {
  if (!item || typeof item !== "object") return null;
  let handle = textValue(item.handle, 80).replace(/^@+/, "");
  const line = textValue(item.line);
  if (!handle || !line) return null;
  return {
    handle,
    line,
    urgency: urgencyValue(item.urgency),
    confidence: confidenceValue(item.confidence),
  };
}

function normalizeAction(item, index, chunkIndex) {
  if (!item || typeof item !== "object") return null;
  const text = textValue(item.text);
  if (!text) return null;
  const owner = textValue(item.owner, 160);
  const dueDate = textValue(item.dueDate, 160);
  return {
    id: stableId(`task-c${chunkIndex}`, index, text),
    text,
    owner: owner || null,
    dueDate: dueDate || null,
    urgency: urgencyValue(item.urgency),
    evidence: textValue(item.evidence, 1000),
    confidence: confidenceValue(item.confidence),
    completed: false,
  };
}

function normalizeDeadline(item, index, chunkIndex) {
  if (!item || typeof item !== "object") return null;
  const text = textValue(item.text);
  if (!text) return null;
  const dates = listValue(item.dates)
    .map((date) => textValue(date, 160))
    .filter(Boolean);
  return {
    id: stableId(`deadline-c${chunkIndex}`, index, text),
    text,
    dates: [...new Set(dates)],
    urgency: urgencyValue(item.urgency),
    confidence: confidenceValue(item.confidence),
  };
}

function normalizeUrgentRow(item, index, chunkIndex) {
  const value = typeof item === "string" ? { text: item } : item;
  if (!value || typeof value !== "object") return null;
  const text = textValue(value.text);
  if (!text) return null;
  return {
    id: stableId(`urgent-c${chunkIndex}`, index, text),
    text,
    reason: textValue(value.reason, 1000),
    urgency: "High",
    confidence: confidenceValue(value.confidence),
  };
}

export function normalizeModelChunk(payload, chunkIndex = 0) {
  let parsed = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new Error("The local model returned invalid JSON. Retry the analysis.");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The local model returned an unexpected response shape. Retry the analysis.");
  }

  const actions = listValue(parsed.actions)
    .map((item, index) => normalizeAction(item, index, chunkIndex))
    .filter(Boolean);
  const deadlines = listValue(parsed.deadlines)
    .map((item, index) => normalizeDeadline(item, index, chunkIndex))
    .filter(Boolean);
  const mentions = listValue(parsed.mentions)
    .map(normalizeMention)
    .filter(Boolean);
  const urgentRows = listValue(parsed.urgentRows)
    .map((item, index) => normalizeUrgentRow(item, index, chunkIndex))
    .filter(Boolean);
  const summary = listValue(parsed.summary)
    .map((item) => textValue(item, 1500))
    .filter(Boolean);
  const decisions = listValue(parsed.decisions)
    .map((item) => typeof item === "string" ? textValue(item) : textValue(item?.text))
    .filter(Boolean);

  return { summary, actions, decisions, deadlines, mentions, urgentRows };
}

function dedupe(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item).toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function combineAnalysisChunks(rawText, chunks, modelId = "") {
  const normalizedChunks = listValue(chunks);
  const actions = dedupe(normalizedChunks.flatMap((chunk) => chunk.actions || []), (item) => item.text);
  const decisions = dedupe(normalizedChunks.flatMap((chunk) => chunk.decisions || []), (item) => item);
  const deadlines = dedupe(normalizedChunks.flatMap((chunk) => chunk.deadlines || []), (item) => `${item.text}|${(item.dates || []).join(",")}`);
  const mentions = dedupe(normalizedChunks.flatMap((chunk) => chunk.mentions || []), (item) => `${item.handle}|${item.line}`);
  const urgentRows = dedupe(normalizedChunks.flatMap((chunk) => chunk.urgentRows || []), (item) => item.text);
  const summary = dedupe(normalizedChunks.flatMap((chunk) => chunk.summary || []), (item) => item);
  const lineCount = String(rawText ?? "").split(/\r?\n/).filter((line) => line.trim()).length;

  const alerts = [
    ...actions.map((item) => ({ ...item, kind: "Action item" })),
    ...deadlines.map((item) => ({ ...item, kind: "Deadline" })),
    ...mentions.map((item, index) => ({
      id: stableId("mention", index, `${item.handle}|${item.line}`),
      text: `@${item.handle} mentioned: ${item.line}`,
      owner: null,
      urgency: item.urgency,
      kind: "Mention",
    })),
    ...urgentRows.map((item) => ({ ...item, kind: "Urgent message" })),
  ];

  return {
    summary,
    actions,
    decisions,
    deadlines,
    mentions,
    urgentRows,
    alerts: dedupe(alerts, (item) => `${item.kind}|${item.text}`),
    lineCount,
    sourceChunks: normalizedChunks.length,
    modelId,
  };
}
