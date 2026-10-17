function cleanExcerpt(value, maxLength = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value).trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Creates a summary only from source-backed rule findings.
 * It intentionally does not use the language model's free-form summary,
 * because small models can swap speakers and assignees while paraphrasing.
 * Quoted excerpts retain the original speaker and addressee from the chat.
 */
export function buildSourceGroundedSummary(findings = {}) {
  const actions = Array.isArray(findings.actions) ? findings.actions : [];
  const decisions = Array.isArray(findings.decisions) ? findings.decisions : [];
  const deadlines = Array.isArray(findings.deadlines) ? findings.deadlines : [];
  const mentions = Array.isArray(findings.mentions) ? findings.mentions : [];
  const urgentRows = Array.isArray(findings.urgentRows) ? findings.urgentRows : [];
  const summary = [];

  if (actions.length) {
    summary.push(
      `${actions.length} source-backed action candidate${actions.length === 1 ? "" : "s"} detected.`
    );
    actions.slice(0, 3).forEach((action) => {
      const excerpt = cleanExcerpt(action?.text);
      if (excerpt) summary.push(`Action evidence from the original chat: “${excerpt}”`);
    });
  }

  decisions.slice(0, 2).forEach((decision) => {
    const excerpt = cleanExcerpt(typeof decision === "string" ? decision : decision?.text);
    if (excerpt) summary.push(`Decision recorded in the original chat: “${excerpt}”`);
  });

  const timeReferences = unique(deadlines.flatMap((item) =>
    Array.isArray(item?.dates) ? item.dates.map((date) => String(date).trim()) : []
  )).slice(0, 4);
  if (timeReferences.length) {
    summary.push(`Time references found in the source: ${timeReferences.join(", ")}.`);
  } else if (deadlines.length) {
    summary.push(`${deadlines.length} source line${deadlines.length === 1 ? " contains" : "s contain"} a possible time reference; review the Deadlines and timing panel.`);
  }

  const handles = unique(mentions.map((mention) => `@${String(mention?.handle ?? "").replace(/^@+/, "")}`)).slice(0, 5);
  if (handles.length) summary.push(`Direct mentions found in the source: ${handles.join(", ")}.`);

  urgentRows.slice(0, 2).forEach((row) => {
    const value = typeof row === "string" ? row : row?.text;
    const excerpt = cleanExcerpt(value);
    if (excerpt) summary.push(`Urgency signal from the original chat: “${excerpt}”`);
  });

  if (!summary.length) {
    summary.push("No clear source-backed action, decision, deadline, mention, or urgency signal was found by the local rule checks.");
    summary.push("Review the original conversation before treating this as a complete summary.");
  }

  return summary.slice(0, 8);
}
