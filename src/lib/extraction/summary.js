import { normalizeLine, uniqueBy, urgencyFor } from "./text.js";

export function buildSummary(
  text,
  actions,
  deadlines,
  decisions,
  mentions
) {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const summary = [];

  if (actions.length > 0) {
    const highCount = actions.filter(
      (item) => item.urgency === "High"
    ).length;

    summary.push(
      `${actions.length} potential action item${actions.length === 1 ? "" : "s"} detected; ${highCount} marked high priority.`
    );
  }

  if (decisions.length > 0) {
    summary.push(
      `${decisions.length} possible decision${decisions.length === 1 ? "" : "s"} found, including: “${decisions[0]}”.`
    );
  }

  if (deadlines.length > 0) {
    const dateExamples = uniqueBy(
      deadlines.flatMap((item) => item.dates),
      (value) => value.toLowerCase()
    ).slice(0, 4);

    summary.push(
      `Time references detected: ${dateExamples.join(", ")}.`
    );
  }

  if (mentions.length > 0) {
    const handles = uniqueBy(
      mentions.map((item) => `@${item.handle}`),
      (value) => value.toLowerCase()
    ).slice(0, 5);

    summary.push(
      `Direct mentions to review: ${handles.join(", ")}.`
    );
  }

  lines
    .filter((line) => urgencyFor(line) === "High")
    .slice(0, 2)
    .forEach((line) => {
      summary.push(`High-signal message: “${line}”.`);
    });

  if (summary.length === 0) {
    summary.push(
      "No clear action items, decisions, deadlines, or direct mentions were detected."
    );

    summary.push(
      "Review the original conversation before treating this as a complete summary."
    );
  }

  return summary;
}
