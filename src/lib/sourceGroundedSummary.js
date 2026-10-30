function exactExcerpt(item, snapshot, fallbackText) {
  const span = item?.sourceSpan;
  if (snapshot && Number.isSafeInteger(span?.startOffset) && Number.isSafeInteger(span?.endOffset)) {
    return snapshot.rawText.slice(span.startOffset, span.endOffset);
  }
  return typeof fallbackText === "string" ? fallbackText : "";
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
 * Builds a concise summary from deterministic rule findings. When a snapshot
 * is supplied, displayed excerpts are read from its exact source spans.
 * This establishes source-reference integrity only, not semantic correctness.
 */
export function buildSourceGroundedSummary(findings = {}, snapshot = null) {
  const actions = Array.isArray(findings.actions) ? findings.actions : [];
  const decisions = Array.isArray(findings.decisionEvidence) && findings.decisionEvidence.length
    ? findings.decisionEvidence
    : (Array.isArray(findings.decisions) ? findings.decisions : []);
  const deadlines = Array.isArray(findings.deadlines) ? findings.deadlines : [];
  const mentions = Array.isArray(findings.mentions) ? findings.mentions : [];
  const urgentRows = Array.isArray(findings.urgentRowEvidence) && findings.urgentRowEvidence.length
    ? findings.urgentRowEvidence
    : (Array.isArray(findings.urgentRows) ? findings.urgentRows : []);
  const summary = [];

  if (actions.length) {
    summary.push(`${actions.length} rule-detected action candidate${actions.length === 1 ? "" : "s"}.`);
    actions.slice(0, 3).forEach((action) => {
      const excerpt = exactExcerpt(action, snapshot, action?.text);
      if (excerpt) summary.push(`Action-pattern line: “${excerpt}”`);
    });
  }

  decisions.slice(0, 2).forEach((decision) => {
    const item = typeof decision === "string" ? { text: decision } : decision;
    const excerpt = exactExcerpt(item, snapshot, item?.text);
    if (excerpt) summary.push(`Decision-pattern line: “${excerpt}”`);
  });

  const timeReferences = unique(deadlines.flatMap((item) =>
    Array.isArray(item?.dates) ? item.dates.map((date) => String(date).trim()) : []
  )).slice(0, 4);
  if (timeReferences.length) {
    summary.push(`Possible time references detected: ${timeReferences.join(", ")}.`);
  } else if (deadlines.length) {
    summary.push(`${deadlines.length} line${deadlines.length === 1 ? " contains" : "s contain"} a possible time reference; review the timing panel.`);
  }

  const handles = unique(mentions.map((mention) => `@${String(mention?.handle ?? "").replace(/^@+/, "")}`)).slice(0, 5);
  if (handles.length) summary.push(`Direct-mention patterns detected: ${handles.join(", ")}.`);

  urgentRows.slice(0, 2).forEach((row) => {
    const excerpt = exactExcerpt(row, snapshot, typeof row === "string" ? row : row?.text);
    if (excerpt) summary.push(`Urgency-pattern line: “${excerpt}”`);
  });

  if (!summary.length) {
    summary.push("No clear action, decision, deadline, mention, or urgency patterns were detected by local rules.");
    summary.push("Review the original conversation; pattern-based extraction is not exhaustive.");
  }

  return summary.slice(0, 8);
}
