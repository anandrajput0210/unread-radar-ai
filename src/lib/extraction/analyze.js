import { extractActions } from "./actions.js";
import { extractMentions } from "./mentions.js";
import { buildSummary } from "./summary.js";
import { sourceLineRecords, sourceSpan, uniqueBy, urgencyFor } from "./text.js";
import { extractDeadlines } from "./timing.js";

export function analyzeConversations(rawText, options = {}) {
  const text = typeof rawText === "string" ? rawText : "";
  if (!text.trim()) {
    return {
      actions: [], decisions: [], decisionEvidence: [], deadlines: [], mentions: [],
      summary: [], alerts: [], urgentRows: [], urgentRowEvidence: [], lineCount: 0,
    };
  }

  const records = sourceLineRecords(text);
  const sourceRecords = records.filter((record) => record.text);
  const sourceLines = sourceRecords.map((record) => record.text);
  const urgentRowEvidence = sourceRecords
    .filter((record) => urgencyFor(record.text) === "High")
    .map((record) => ({ text: record.text, sourceSpan: sourceSpan(record) }));
  const urgentRows = urgentRowEvidence.map((item) => item.text);

  const mentions = extractMentions(text, options);
  const deadlines = extractDeadlines(text, options);
  const { actions, decisions, decisionEvidence } = extractActions(text, options);

  const alerts = uniqueBy(
    [
      ...actions.map((item) => ({ ...item, kind: "Action item" })),
      ...deadlines.map((item) => ({ ...item, kind: "Deadline" })),
      ...mentions.map((item, index) => ({
        id: `mention-${index}`,
        text: `@${item.handle} mentioned: ${item.line}`,
        owner: item.handle,
        urgency: urgencyFor(item.line),
        kind: "Mention",
        sourceSpan: item.sourceSpan,
      })),
    ],
    (item) => `${item.kind}|${item.text.toLowerCase()}`,
  );

  return {
    actions,
    decisions,
    decisionEvidence,
    deadlines,
    mentions,
    summary: buildSummary(text, actions, deadlines, decisions, mentions),
    alerts,
    urgentRows,
    urgentRowEvidence,
    lineCount: sourceLines.length,
  };
}
