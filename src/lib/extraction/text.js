import { HIGH_URGENCY_TERMS, MEDIUM_URGENCY_TERMS, escapeRegex } from "./constants.js";

export function normalizeLine(line) {
  return String(line ?? "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .trim();
}

export function sourceLineRecords(text) {
  const value = String(text ?? "");
  const lines = value.split(/\r?\n/);
  let startOffset = 0;
  return lines.map((rawText, index) => {
    const endOffset = startOffset + rawText.length;
    const record = {
      rawText,
      startOffset,
      endOffset,
      ordinal: index,
      text: normalizeLine(rawText),
    };
    if (index < lines.length - 1) {
      startOffset = endOffset + (value.startsWith("\r\n", endOffset) ? 2 : 1);
    }
    return record;
  });
}

export function sourceSpan(record) {
  return { startOffset: record.startOffset, endOffset: record.endOffset };
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();

  return items.filter((item) => {
    const key = keyFn(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function isNegatedAt(text, index) {
  const prefix = text.slice(
    Math.max(0, index - 64),
    index
  );

  return /\b(?:no|not|never|without|isn't|isn’t|aren't|aren’t|wasn't|wasn’t|weren't|weren’t|don't|don’t|doesn't|doesn’t|didn't|didn’t|can't|can’t|cannot|won't|won’t|will not|do not|does not|did not|is not|are not|was not|were not)\b(?:\W+\p{L}+){0,3}\W*$/iu.test(
    prefix
  );
}

export function hasUnnegatedTerm(text, term) {
  const escaped = term
    .trim()
    .split(/\s+/)
    .map(escapeRegex)
    .join("\\s+");

  const regex = new RegExp(
    String.raw`(^|[^\p{L}\p{N}])(${escaped})(?=$|[^\p{L}\p{N}])`,
    "giu"
  );

  let match;

  while ((match = regex.exec(text)) !== null) {
    const termIndex = match.index + match[1].length;

    if (!isNegatedAt(text, termIndex)) {
      return true;
    }

    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  return false;
}

export function hasUnnegatedPattern(text, pattern) {
  const flags = [
    pattern.ignoreCase ? "i" : "",
    "g",
    "u",
  ].join("");

  const regex = new RegExp(pattern.source, flags);
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (!isNegatedAt(text, match.index)) {
      return true;
    }

    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  return false;
}

export function urgencyFor(text) {
  const value = String(text ?? "");

  if (
    HIGH_URGENCY_TERMS.some((term) =>
      hasUnnegatedTerm(value, term)
    )
  ) {
    return "High";
  }

  if (
    MEDIUM_URGENCY_TERMS.some((term) =>
      hasUnnegatedTerm(value, term)
    ) ||
    hasUnnegatedPattern(
      value,
      /\b(?:by|before|at|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i
    )
  ) {
    return "Medium";
  }

  return "Low";
}
