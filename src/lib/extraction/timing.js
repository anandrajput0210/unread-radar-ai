import { COMMITMENT_REGEX, NON_ACTIONABLE_TIME_REFERENCE_REGEX, TIMING_TOKEN_REGEX } from "./constants.js";
import { resolveDeadlineDate } from "./dates.js";
import { conversationMessageRecords, recordMeta, resolveParseOptions } from "./records.js";
import { isNegatedAt, sourceSpan, uniqueBy, urgencyFor } from "./text.js";

export function mergeAdjacentTimingTokens(text, matches) {
  const merged = [];
  for (const match of matches) {
    const current = {
      text: match[0].trim(),
      index: match.index,
      end: match.index + match[0].length,
    };
    const previous = merged.at(-1);
    const gap = previous ? text.slice(previous.end, current.index) : "";
    const previousIsClock = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i.test(previous?.text || "");
    const currentIsClock = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i.test(current.text);
    const previousIsDay = /\b(?:today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(previous?.text || "");
    const currentIsDay = /\b(?:today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(current.text);
    if (previous && gap.length <= 12 && !/[.!?;]/.test(gap) && ((previousIsDay && currentIsClock) || (previousIsClock && currentIsDay))) {
      previous.text = text.slice(previous.index, current.end).trim();
      previous.end = current.end;
    } else {
      merged.push(current);
    }
  }
  return merged;
}

export function timingSignalIsExplicit(text, token) {
  const prefix = text.slice(Math.max(0, token.index - 72), token.index);
  return /\b(?:by|before|due(?:\s+by)?|no\s+later\s+than|deadline)\b[\s\S]{0,68}$/iu.test(prefix)
    || /\bkal\s+tak\b/iu.test(token.text)
    || /\baaj\b/iu.test(token.text)
    || /\b(?:were|was)\s+supposed\s+to\b[\s\S]{0,68}$/iu.test(prefix);
}

export function isMeetingTimeContext(text, token) {
  const nearby = text.slice(Math.max(0, token.index - 60), Math.min(text.length, token.end + 48));
  return /\b(?:meeting\s+time|scheduled\s+(?:for|at)|review\s+is\s+scheduled|stand[- ]?up\s+is\s+at)\b/i.test(nearby) &&
    !timingSignalIsExplicit(text, token);
}

export function extractTimingSignals(text, { allowCommitmentTiming = false } = {}) {
  const value = String(text ?? "");
  const matches = mergeAdjacentTimingTokens(value, [...value.matchAll(new RegExp(TIMING_TOKEN_REGEX.source, "giu"))]);
  const hasCommitment = allowCommitmentTiming && [...value.matchAll(new RegExp(COMMITMENT_REGEX.source, "giu"))]
    .some((match) => !isNegatedAt(value, match.index));

  return uniqueBy(matches.filter((token) => {
    if (isMeetingTimeContext(value, token)) return false;
    if (timingSignalIsExplicit(value, token)) return true;
    // A relative day-part directly attached to a first-person action is an
    // explicit execution time, unlike a standalone meeting/update clock.
    return hasCommitment && /\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:morning|afternoon|evening|noon|midnight)\b/i.test(token.text);
  }).map((token) => token.text.replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/iu, "$1, $2")), (value) => value.toLocaleLowerCase());
}

export function extractDeadlines(text, options = {}) {
  options = resolveParseOptions(text, options);
  const items = [];
  for (const record of conversationMessageRecords(text, options)) {
    const line = record.text;
    if (!line || NON_ACTIONABLE_TIME_REFERENCE_REGEX.test(line)) continue;
    const parsed = recordMeta(record, options);
    const { body } = parsed;
    if (/^\s*(?:got\s+it|understood|yes|sure|okay|ok|noted)[,!.\s]/iu.test(body) && [...body.matchAll(new RegExp(COMMITMENT_REGEX.source, "giu"))].length) continue;
    // Dates attached to an explicit decision are not automatically task deadlines.
    if (/^\s*(?:decision:|agreed\s+decision:)/iu.test(body)) continue;
    const matches = extractTimingSignals(body, { allowCommitmentTiming: true });
    if (!matches.length) continue;
    items.push({
      id: `deadline-${items.length}-${line.slice(0, 18)}`,
      text: line,
      dates: matches,
      resolvedDates: matches.map((date) => resolveDeadlineDate(date, parsed.timestamp?.date || null, options)),
      messageDate: parsed.timestamp?.date || null,
      urgency: urgencyFor(line),
      sourceSpan: sourceSpan(record),
    });
  }
  return uniqueBy(items, (item) => `${item.text.toLowerCase()}|${item.dates.join(",").toLowerCase()}`);
}

export function extractDueSignal(text, { allowCommitmentTiming = true } = {}) {
  const unique = extractTimingSignals(String(text ?? ""), { allowCommitmentTiming });
  return unique.length ? unique.join(", ") : null;
}

export function dueDateStatusForAction(actionText, dueDate, sourceBody = "") {
  if (!dueDate) return null;
  const action = String(actionText ?? "").toLocaleLowerCase().replace(/\s+/g, " ");
  const body = String(sourceBody ?? "").toLocaleLowerCase().replace(/\s+/g, " ");
  const parts = String(dueDate).split(/,\s*/).map((part) => part.trim().toLocaleLowerCase()).filter(Boolean);
  return parts.length > 0 && parts.every((part) => action.includes(part))
    ? "explicit"
    : /\b(?:by|before|due|deadline|supposed to)\b/u.test(body)
      ? "contextual"
      : "explicit";
}
