import { Copy } from "lucide-react";
import { sourceReferenceLabel, toPercent } from "../ui/format.js";
import { TASK_STATUS_LABELS, getTaskStatus } from "../views/taskWorkflow.js";
import { MODEL_ID } from "../ai/localAiEngine.js";
import { buildPriorityView } from "../views/priorityView.js";

/** Builds the Markdown executive brief from an analysis result. Pure: no DOM access. */
export function buildExecutiveBrief({ analysis, taskStatuses, loadedFileName }) {
  const lineCount = analysis.lineCount;
  const generatedAt = new Date().toLocaleString();
  const prioritySummary = buildPriorityView(analysis);
  const taskLines = analysis.actions.length
    ? analysis.actions.map((task) => {
        const due = task.dueDate
          ? task.dueDateStatus === "contextual"
            ? ` · Contextual timing (verify): ${task.dueDate}`
            : task.dueDateStatus === "explicit"
              ? ` · Explicit deadline: ${task.dueDate}`
              : ` · Unverified due signal: ${task.dueDate}`
          : "";
        const owner = task.owner
          ? ` · Assigned to: ${task.owner}`
          : task.classification === "unassigned_request"
            ? " · Unassigned request"
            : " · Owner not explicit";
        const confidence = typeof task.confidence === "number" ? ` · Confidence: ${Math.round(task.confidence * 100)}%` : "";
        const evidence = task.sourceEvidence?.quote
          ? `\n  - Exact source span (${sourceReferenceLabel(task)}): ${task.sourceEvidence.quote}`
          : `\n  - ${sourceReferenceLabel(task)}${task.evidence ? `; model-provided excerpt (unverified): ${task.evidence}` : ""}`;
        const conditionStatusLabel = task.conditionStatus === "reported_satisfied"
          ? "Condition reported satisfied"
          : task.conditionStatus === "reported_rejected"
            ? "Condition reported rejected"
            : task.conditionStatus === "ambiguous"
              ? "Condition status ambiguous"
              : "Condition pending verification";
        const condition = task.condition ? ` · ${conditionStatusLabel}: ${task.condition}` : "";
        const supporting = task.supportingEvidence?.length
          ? task.supportingEvidence.map((detail) => `\n  - ${detail.kind || "Related context"} (${detail.sourceReferenceStatus || "unverified"}): ${detail.evidence?.quote || detail.text}`).join("")
          : "";
        return `- **${TASK_STATUS_LABELS[getTaskStatus(taskStatuses, task.id)]}** · **${task.urgency}** — ${task.text}${due}${owner}${condition}${confidence}${evidence}${supporting}`;
      })
    : ["- No action items were extracted."];
  const urgentLines = analysis.urgentRows.length
    ? analysis.urgentRows.map((row) => `> ${row.text}${row.reason ? ` — ${row.reason}` : ""}\n> ${sourceReferenceLabel(row)}${row.sourceEvidence?.quote ? ` · Exact source: ${row.sourceEvidence.quote}` : ""}`)
    : ["> No high-urgency rows were extracted."];
  const mentionLines = analysis.mentions.length
    ? analysis.mentions.map((mention) => `- **@${mention.handle}** — ${mention.line}\n  - ${sourceReferenceLabel(mention)}${mention.sourceEvidence?.quote ? ` · Exact source: ${mention.sourceEvidence.quote}` : ""}`)
    : ["- No direct mentions were extracted."];
  const deadlineLines = analysis.deadlines.length
    ? analysis.deadlines.map((deadline) => `- **${deadline.dates.join(", ") || "Time reference"}** — ${deadline.text}\n  - ${sourceReferenceLabel(deadline)}${deadline.sourceEvidence?.quote ? ` · Exact source: ${deadline.sourceEvidence.quote}` : ""}`)
    : ["- No deadline signals were extracted."];
  const decisionLines = analysis.decisions.length
    ? analysis.decisions.map((decision) => {
        const finding = analysis.decisionFindings?.find((item) => item.text === decision);
        return `- ${decision}\n  - ${sourceReferenceLabel(finding)}`;
      })
    : ["- No decisions were extracted."];

  const markdown = [
    "# Unread Radar AI — Local Executive Brief",
    "",
    `- **Generated:** ${generatedAt}`,
    `- **Source:** ${loadedFileName || "Pasted conversation"}`,
    `- **Model:** ${analysis.modelId || MODEL_ID}`,
    `- **Processing:** ${analysis.modelExecution?.status === "completed" ? "On-device WebLLM/WebGPU inference combined with local rules" : "Local deterministic rules only; limited pattern coverage; no successful model inference recorded"}; chat content is not sent to a hosted AI API`,
    `- **Inference execution:** ${analysis.modelExecution?.status === "completed" ? `${analysis.modelExecution.modelId}; ${analysis.modelExecution.structuredResponsesValidated}/${analysis.modelExecution.segmentsRequested} structured model responses validated` : "No successful Qwen inference recorded; rules-only results must not be described as model output"}`,
    `- **Source structure:** ${analysis.sourceBoundaryMode === "opaque" ? "One opaque source message; author/timestamp unknown; reduced message-level granularity" : `${analysis.sourceMessageCount} recognized source records`}`,
    "- **Evidence semantics:** Valid source references confirm the exact source location and quotation only; semantic support is unverified.",
    "",
    "## Executive Summary",
    "",
    ...(analysis.summary.length ? analysis.summary.map((item) => `- ${item}`) : ["- No summary was returned by the local model."]),
    "",
    "## Operational Index Analytics",
    "",
    `- **Non-empty rows:** ${analysis.lineCount}`,
    `- **Unique priority items:** ${prioritySummary.uniquePriorityCount} (${prioritySummary.uniqueTaskCount} task candidates + ${prioritySummary.standaloneSignalCount} standalone source signals)`,
    `- **Supporting signals attached to task messages:** ${prioritySummary.linkedSignalCount} (not counted again as separate priority items)`,
    `- **High-priority unique items:** ${prioritySummary.counts.High}`,
    `- **High-urgency source rows:** ${analysis.urgentRows.length} (${toPercent(analysis.urgentRows.length, lineCount)}%)`,
    `- **Action items:** ${analysis.actions.length} (${toPercent(analysis.actions.length, lineCount)}% of rows)`,
    `- **Missed mentions:** ${analysis.mentions.length}`,
    "",
    "## Action Items",
    "",
    ...taskLines,
    "",
    "## High-Urgency Rows",
    "",
    ...urgentLines,
    "",
    "## Mentions",
    "",
    ...mentionLines,
    "",
    "## Deadlines and Scheduling Signals",
    "",
    ...deadlineLines,
    "",
    "## Decisions",
    "",
    ...decisionLines,
    "",
    "---",
    analysis.analysisMode === "rules-only"
      ? "Generated by Unread Radar AI using deterministic local rules only. Pattern coverage is limited; verify every finding against the source."
      : "Generated by Unread Radar AI using a language model running locally in the browser plus local rules. AI extraction may be wrong; verify important items against the source.",
    "",
  ].join("\n");
  return markdown;
}

/** Builds the plain-text summary that the "Copy" button puts on the clipboard. */
export function buildCopySummary({ analysis, taskStatuses }) {
  const content = [
    "UNREAD RADAR AI — LOCAL SUMMARY",
    "",
    ...analysis.summary.map((item) => `• ${item}`),
    "",
    "ACTION ITEMS",
    ...analysis.actions.map((item) => `• [${TASK_STATUS_LABELS[getTaskStatus(taskStatuses, item.id)]}] [${item.urgency}] ${item.text} — ${sourceReferenceLabel(item)}${item.sourceEvidence?.quote ? ` — Exact source: ${item.sourceEvidence.quote}` : item.evidence ? ` — Model excerpt (unverified): ${item.evidence}` : ""}`),
    "",
    "DECISIONS",
    ...analysis.decisions.map((item) => `• ${item}`),
  ].join("\n");
  return content;
}
