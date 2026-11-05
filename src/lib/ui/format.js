export function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}


export function urgencyTone(urgency) {
  if (urgency === "High") return "red";
  if (urgency === "Medium") return "amber";
  return "slate";
}


export function sourceReferenceLabel(finding) {
  return finding?.sourceReferenceStatus === "valid"
    ? "Source reference valid; semantic support unverified"
    : "UNVERIFIED: no exact source reference";
}


export function describeImportWarnings(snapshot) {
  const warnings = Array.isArray(snapshot?.importWarnings) ? snapshot.importWarnings : [];
  if (!warnings.length) return "";
  return ` Import check: ${warnings.map((warning) => warning.message).join(" ")}`;
}

export const toPercent = (value, total) => total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
