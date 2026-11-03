import { parseChatExport } from "./chatExportParser.js";

const HIGH_URGENCY_TERMS = [
  "asap",
  "urgent",
  "critical",
  "blocked",
  "immediately",
  "outage",
  "emergency",
  "spiking",
  "incident",
  "overdue",
];

const MEDIUM_URGENCY_TERMS = [
  "deadline",
  "due",
  "today",
  "tonight",
  "tomorrow",
  "yesterday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "aaj",
  "kal",
  "eod",
  "eow",
  "eoy",
  "follow up",
  "look into",
  "look at",
  "reach out",
  "check with",
  "research",
];

const TASK_VERBS = [
  "follow up", "look into", "look at", "reach out", "check with", "pick up", "roll back", "send out",
  "investigate", "complete", "prepare", "escalate", "respond", "restart", "restore", "schedule",
  "confirm", "publish", "replace", "forward", "monitor", "approve", "review", "submit", "create",
  "remove", "assign", "verify", "install", "document", "cancel", "pause", "deploy", "update",
  "finish", "notify", "provide", "attach", "merge", "build", "check", "write", "share", "close",
  "open", "bring", "tell", "call", "test", "fix", "book", "send", "ship", "flag", "run", "get",
  "set", "add", "upload", "inspect", "post", "rotate", "own", "contact", "include", "deliver",
  "collect", "draft", "analyze", "analyse", "trace", "triage", "resolve", "configure", "enable",
  "disable", "compile", "coordinate", "schedule", "finalize", "finalise", "investigate", "update",
  // Common code-mixed/Hinglish action phrases. These are deliberately specific;
  // broad verbs such as "kar do" alone create too many false positives.
  "bhej dena", "bhej do", "bhejna", "send kar dena", "send kar do", "send karna",
  "share kar dena", "share kar do", "share karna", "remind kar dena", "remind kar do",
  "update kar dena", "update kar do", "check kar lena", "check kar lo", "finish karna",
  "complete karna", "submit karna", "book kar lena", "book kar lo", "forward kar dena",
  "forward kar do", "call kar lena", "call kar lo", "de dena", "de do",
];

const DECISION_TERMS = [
  "agreed on",
  "agreed decision:",
  "decision:",
  "decided that",
  "decided to",
  "we decided",
];

const SPECIAL_MENTIONS = new Set([
  "here",
  "channel",
  "everyone",
]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TASK_VERB_SOURCE = [...TASK_VERBS]
  .sort((a, b) => b.length - a.length)
  .map((verb) => escapeRegex(verb).replace(/\s+/g, "\\s+"))
  .join("|");

const HANDLE_SOURCE = String.raw`[\p{L}\p{N}_-](?:[\p{L}\p{N}._-]{0,38}[\p{L}\p{N}_-])?`;

const MENTION_REGEX = new RegExp(
  String.raw`(^|[^\p{L}\p{N}._%+-])@(${HANDLE_SOURCE})`,
  "gu"
);

const TIMING_TOKEN_REGEX =
  /\b(?:day\s+after\s+tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|kal\s+tak|aaj|today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening|noon|midnight))?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s?(?:am|pm))?|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b|\b(?:\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})\b/giu;

const ACTION_LABEL_REGEX =
  /(?:^|:\s*)\b(?:action(?:\s+item)?|todo|to-do)\b\s*(?::|—|–|-)\s*(.*)$/i;

const REQUEST_REGEX = new RegExp(
  String.raw`\b(?:please|can\s+(?:you|someone|anyone|somebody)|could\s+(?:you|someone|anyone|somebody)|would\s+you)\s+(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

const MODAL_DIRECTIVE_REGEX = new RegExp(
  String.raw`\b(?:must|should|have to|has to)\s+(?!not\b)(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

const COMMITMENT_REGEX = new RegExp(
  String.raw`\b(?<pronoun>I|we)(?:['’]ll|\s+(?:can|will|shall|am going to|are going to))\s+(?<verb>${TASK_VERB_SOURCE})\b`,
  "giu"
);

const IMPERATIVE_REGEX = new RegExp(
  String.raw`(?:^|[:.!?]\s+)(?:please\s+(?:also\s+)?)?(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

function normalizeLine(line) {
  return String(line ?? "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .trim();
}

function sourceLineRecords(text) {
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

function sourceSpan(record) {
  return { startOffset: record.startOffset, endOffset: record.endOffset };
}

function uniqueBy(items, keyFn) {
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

function isNegatedAt(text, index) {
  const prefix = text.slice(
    Math.max(0, index - 64),
    index
  );

  return /\b(?:no|not|never|without|isn't|isn’t|aren't|aren’t|wasn't|wasn’t|weren't|weren’t|don't|don’t|doesn't|doesn’t|didn't|didn’t|can't|can’t|cannot|won't|won’t|will not|do not|does not|did not|is not|are not|was not|were not)\b(?:\W+\p{L}+){0,3}\W*$/iu.test(
    prefix
  );
}

function hasUnnegatedTerm(text, term) {
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

function hasUnnegatedPattern(text, pattern) {
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

export function extractMentions(text, options = {}) {
  const matches = [];

  for (const record of conversationMessageRecords(text, options)) {
    const line = record.text;
    const regex = new RegExp(MENTION_REGEX.source, "gu");
    let match;

    while ((match = regex.exec(line)) !== null) {
      const handle = match[2];
      if (handle && !SPECIAL_MENTIONS.has(handle.toLowerCase())) {
        matches.push({
          handle,
          line,
          sourceSpan: sourceSpan(record),
        });
      }
      if (match[0].length === 0) regex.lastIndex += 1;
    }
  }

  return uniqueBy(matches, (item) => `${item.handle.toLowerCase()}|${item.line.toLowerCase()}`);
}

const NON_ACTIONABLE_TIME_REFERENCE_REGEX =
  /\b(?:do\s+not|don't|does\s+not|doesn't|did\s+not|didn't)\s+need\s+to\b|\bno\s+need\s+to\b|\bnot\s+(?:necessary|required)\s+to\b|\b(?:do\s+not|don't)\s+have\s+to\b/i;

function mergeAdjacentTimingTokens(text, matches) {
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

function timingSignalIsExplicit(text, token) {
  const prefix = text.slice(Math.max(0, token.index - 72), token.index);
  return /\b(?:by|before|due(?:\s+by)?|no\s+later\s+than|deadline)\b[\s\S]{0,68}$/iu.test(prefix)
    || /\bkal\s+tak\b/iu.test(token.text)
    || /\baaj\b/iu.test(token.text)
    || /\b(?:were|was)\s+supposed\s+to\b[\s\S]{0,68}$/iu.test(prefix);
}

function isMeetingTimeContext(text, token) {
  const nearby = text.slice(Math.max(0, token.index - 60), Math.min(text.length, token.end + 48));
  return /\b(?:meeting\s+time|scheduled\s+(?:for|at)|review\s+is\s+scheduled|stand[- ]?up\s+is\s+at)\b/i.test(nearby) &&
    !timingSignalIsExplicit(text, token);
}

function extractTimingSignals(text, { allowCommitmentTiming = false } = {}) {
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

const RESERVED_SPEAKERS = new Set([
  "action", "action item", "todo", "to-do", "decision", "note", "system", "user", "assistant",
  "no need", "no one", "anyone", "someone", "somebody",
]);

const PERSON_NAME_SOURCE = String.raw`@?[\p{L}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}][\p{L}\p{M}'’.-]*){0,2}`;

function parseCalendarDate(value, { dateOrder = "dmy" } = {}) {
  const input = String(value ?? "").trim();
  if (!input) return null;

  let year; let month; let day;
  let match = input.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/u);
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else {
    match = input.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/u);
    if (match) {
      const first = Number(match[1]); const second = Number(match[2]);
      year = Number(match[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      if (first > 12) { day = first; month = second; }
      else if (second > 12) { month = first; day = second; }
      else if (dateOrder === "mdy") { month = first; day = second; }
      else { day = first; month = second; }
    } else {
      match = input.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})$/iu)
        || input.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})[,]?\s+(\d{4})$/iu);
      if (!match) return null;
      const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const monthTextFirst = /^[A-Za-z]/u.test(input);
      const monthText = (monthTextFirst ? match[1] : match[2]).slice(0, 3).toLowerCase();
      month = monthNames.indexOf(monthText) + 1;
      day = Number(monthTextFirst ? match[2] : match[1]);
      year = Number(match[3]);
    }
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseWhatsAppTimestamp(value, options = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dateMatch = raw.match(/\b\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}\b|\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b/u)
    || raw.match(/\b[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}\b/iu);
  if (!dateMatch) return null;
  const date = parseCalendarDate(dateMatch[0], options);
  if (!date) return null;
  const timeMatch = raw.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/iu);
  let time = null;
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const meridiem = timeMatch[3]?.toLowerCase();
    if (meridiem) {
      if (hour < 1 || hour > 12 || minute > 59) return null;
      if (meridiem === "am" && hour === 12) hour = 0;
      if (meridiem === "pm" && hour !== 12) hour += 12;
    } else if (hour > 23 || minute > 59) return null;
    time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return { raw, date, time };
}

function parseChatRecord(line, options = {}) {
  const original = String(line ?? "");
  let content = original.trim();
  let timestamp = null;

  // iOS exports and some Android exports wrap the timestamp in brackets.
  const bracket = content.match(/^\[([^\]]+)\]\s*(.*)$/u);
  if (bracket) {
    timestamp = parseWhatsAppTimestamp(bracket[1], options);
    if (timestamp) content = bracket[2].trim();
  }

  // Android export: 12/10/24, 2:01 pm - Priya: message
  if (!timestamp) {
    const android = content.match(/^(.{6,48}?)\s+-\s+([\s\S]*)$/u);
    if (android) {
      const parsedTimestamp = parseWhatsAppTimestamp(android[1], options);
      if (parsedTimestamp) {
        timestamp = parsedTimestamp;
        content = android[2].trim();
      }
    }
  }

  // Group task headings are labels, not people speaking.
  const todoHeading = content.match(/^(?:team\s+)?(?:todo|to-do|action\s+items?)\s*:\s*([\s\S]*)$/iu);
  if (todoHeading) {
    return { speaker: null, body: todoHeading[1].trim(), timestamp, hasHeader: true, continuationAllowed: true };
  }

  const header = content.match(/^\s*(?<speaker>[^:\r\n]{1,64}):\s*(?<body>[\s\S]*)$/u);
  if (!header) return { speaker: null, body: content, timestamp, hasHeader: Boolean(timestamp) };
  const speaker = String(header.groups?.speaker || "").trim();
  if (!speaker || RESERVED_SPEAKERS.has(speaker.toLocaleLowerCase())) {
    return { speaker: null, body: String(header.groups?.body || content).trim(), timestamp, hasHeader: true };
  }
  return { speaker, body: String(header.groups?.body || "").trim(), timestamp, hasHeader: true, continuationAllowed: Boolean(timestamp) };
}

/**
 * Resolve, once per analysis, how this text is segmented and which date order
 * applies, using the SAME parser the source/evidence layer uses. Extraction,
 * lifecycle and evidence therefore cannot disagree about message boundaries.
 */
function resolveParseOptions(text, options = {}) {
  if (options.__resolved) return options;
  const parsed = parseChatExport(String(text ?? ""), { dateOrder: options.dateOrder });
  const timestamped = parsed.dialect === "whatsapp-timestamped";
  return {
    ...options,
    __resolved: true,
    __parsed: timestamped ? parsed : null,
    dateOrder: options.dateOrder ?? parsed.dateOrder.order,
    requireMessageDate: options.requireMessageDate ?? true,
  };
}

function recordMeta(record, options = {}) {
  return record.meta ?? parseChatRecord(record.text, options);
}

function sharedMessageRecords(text, parsed) {
  const value = String(text ?? "");
  const records = [];
  for (const message of parsed.messages) {
    // System lines, media placeholders, deleted messages and unattributed
    // preamble are never anyone's commitment.
    if (message.kind !== "message") continue;
    const slice = value.slice(message.startOffset, message.endOffset);
    const bodyLines = value.slice(message.bodyStartOffset, message.endOffset).split(/\r?\n/u);
    const body = bodyLines.map((line, index) => (index === 0 ? line.trim() : normalizeLine(line))).join("\n").trim();
    records.push({
      text: slice.split(/\r?\n/u).map(normalizeLine).join("\n"),
      rawText: slice,
      startOffset: message.startOffset,
      endOffset: message.endOffset,
      ordinal: message.ordinal,
      meta: {
        speaker: message.authorRaw,
        body,
        timestamp: message.timestamp,
        hasHeader: true,
        continuationAllowed: true,
        forwarded: message.forwarded,
      },
    });
  }
  return records;
}

function conversationMessageRecords(text, options = {}) {
  const resolved = resolveParseOptions(text, options);
  if (resolved.__parsed) return sharedMessageRecords(text, resolved.__parsed);
  const physical = sourceLineRecords(text);
  const messages = [];
  let active = null;
  let activeCanContinue = false;

  const flush = () => {
    if (active) messages.push(active);
    active = null;
    activeCanContinue = false;
  };

  for (const line of physical) {
    const parsed = parseChatRecord(line.text, options);
    const startsMessage = parsed.hasHeader;
    if (!active || startsMessage || !activeCanContinue) {
      flush();
      active = {
        text: line.text,
        rawText: line.rawText,
        startOffset: line.startOffset,
        endOffset: line.endOffset,
        ordinal: line.ordinal,
      };
      activeCanContinue = Boolean(parsed.timestamp || parsed.continuationAllowed);
    } else {
      active.text += `\n${line.text}`;
      active.rawText += `\n${line.rawText}`;
      active.endOffset = line.endOffset;
    }
  }
  flush();
  return messages.filter((record) => record.text.trim());
}

function addCalendarDays(dateText, amount) {
  if (!dateText) return null;
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekdayIndex(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function resolveDeadlineDate(duePhrase, messageDate = null, { timeZone, dateOrder = "dmy", requireMessageDate = false } = {}) {
  const phrase = String(duePhrase ?? "").trim().toLocaleLowerCase();
  if (!phrase) return null;
  let baseDate = messageDate;
  if (baseDate && /^\d{4}-\d{2}-\d{2}$/u.test(baseDate) === false) baseDate = parseCalendarDate(baseDate);
  if (!baseDate && requireMessageDate) {
    // No trustworthy message date: only an explicit calendar date can resolve.
    // Relative phrases (tomorrow, kal tak, Monday...) must never be measured
    // from "today", because that silently produces a confident wrong date.
    const explicit = phrase.match(/\b(?:\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|[a-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4})\b/iu);
    return explicit ? parseCalendarDate(explicit[0], { dateOrder }) : null;
  }
  if (!baseDate) {
    const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    baseDate = `${values.year}-${values.month}-${values.day}`;
  }

  if (/\b(?:kal\s+tak|tomorrow|day\s+after\s+tomorrow)\b/u.test(phrase)) return addCalendarDays(baseDate, /day\s+after\s+tomorrow/u.test(phrase) ? 2 : 1);
  if (/\b(?:yesterday)\b/u.test(phrase)) return addCalendarDays(baseDate, -1);
  if (/\b(?:aaj|today|tonight)\b/u.test(phrase)) return baseDate;

  const absoluteDate = phrase.match(/\b(?:\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|[a-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4})\b/iu);
  if (absoluteDate) return parseCalendarDate(absoluteDate[0], { dateOrder });

  const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekdayMatch = phrase.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/u);
  if (weekdayMatch) {
    const target = weekdayNames.indexOf(weekdayMatch[2]);
    const current = weekdayIndex(baseDate);
    let offset = (target - current + 7) % 7;
    if (weekdayMatch[1] || offset === 0 && /\bnext\b/u.test(phrase)) offset = offset === 0 ? 7 : offset + (7 - offset % 7);
    return addCalendarDays(baseDate, offset);
  }
  // Bare "kal" and "parso" are deliberately unresolved: in Hindi they can
  // refer to either a past or future day without surrounding context.
  return null;
}

function trimActionPhrase(body, startIndex) {
  const rest = body.slice(startIndex).trim();
  if (!rest) return "";
  const boundary = /[?!](?=\s|$)|\.(?=\s+[A-Z\p{Lu}]|\s*$)/u.exec(rest);
  return (boundary ? rest.slice(0, boundary.index) : rest)
    .replace(/[\s.!?;,:-]+$/u, "")
    .trim();
}

function directAddressActions(body) {
  const actions = [];
  const regex = new RegExp(
    String.raw`(?:^|[.!?]\s+|,\s*)(${PERSON_NAME_SOURCE})\s*,\s*(?:(?:please\s+(?:also\s+)?)|(?:(?:can|could|would|will)\s+you\s+))?(${TASK_VERB_SOURCE})\b`,
    "giu",
  );
  let match;
  while ((match = regex.exec(body)) !== null) {
    const owner = match[1].trim();
    const verbIndex = match.index + match[0].lastIndexOf(match[2]);
    const actionText = trimActionPhrase(body, verbIndex);
    const groupAddress = /^(?:team|everyone|all|folks|guys)$/iu.test(owner.replace(/^@/, ""));
    const invalidAddress = RESERVED_SPEAKERS.has(owner.toLocaleLowerCase());
    if (actionText && !invalidAddress) actions.push({ text: actionText, owner: groupAddress ? null : owner, classification: groupAddress ? "unassigned_action" : "assigned_task" });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return actions;
}

function extractBulletAssignments(body) {
  const candidates = [];
  const segments = String(body ?? "").split(/\s*(?:\/|;|\n|\|)\s*/u).filter(Boolean);
  const assignmentRegex = new RegExp(
    String.raw`^(${PERSON_NAME_SOURCE})\s+to\s+(${TASK_VERB_SOURCE})\b([\s\S]*)$`,
    "iu",
  );
  for (const segment of segments) {
    const match = segment.trim().match(assignmentRegex);
    if (!match) continue;
    const owner = match[1].trim();
    const actionText = `${match[2]}${match[3] || ""}`.trim().replace(/[.!?]+$/u, "");
    if (actionText && !RESERVED_SPEAKERS.has(owner.toLocaleLowerCase())) {
      candidates.push({ text: actionText, owner, classification: "assigned_task" });
    }
  }
  return candidates;
}

function extractHinglishAction(body) {
  const value = String(body ?? "").trim();
  const pattern = /\b(?:bhej\s+dena|bhej\s+do|bhejna|send\s+kar\s+(?:dena|do|na)|share\s+kar\s+(?:dena|do|na)|remind\s+kar\s+(?:dena|do|na)|update\s+kar\s+(?:dena|do|na)|check\s+kar\s+(?:lena|lo)|finish\s+karna|complete\s+karna|submit\s+karna|book\s+kar\s+(?:lena|lo)|forward\s+kar\s+(?:dena|do)|call\s+kar\s+(?:lena|lo)|de\s+dena|de\s+do)\b/iu;
  if (!pattern.test(value)) return null;
  const cleaned = value.replace(/^(?:bhai|yaar|bro|please|plz)[,!:;\s]+/iu, "").trim();
  if (!cleaned) return null;
  // "Vikram bhai, kal tak invoice bhej dena" addresses Vikram. A capitalised
  // name followed by a comma is an explicit addressee; generic salutations are not.
  const addressed = cleaned.match(/^(?<name>\p{Lu}[\p{L}\p{M}'’.-]*)(?:\s+(?:bhai|bhaiya|ji|sir|madam|didi|yaar))?\s*,\s*(?<rest>[\s\S]+)$/u);
  const name = addressed?.groups?.name;
  if (name && !NON_NAME_WORDS.has(name.toLocaleLowerCase()) && !RESERVED_SPEAKERS.has(name.toLocaleLowerCase())) {
    const rest = addressed.groups.rest.trim();
    if (rest) return { text: rest, owner: name, classification: "assigned_task", origin: "hinglish_rule" };
  }
  return { text: cleaned, owner: null, classification: "unassigned_action", origin: "hinglish_rule" };
}
const NON_NAME_WORDS = new Set(["bhai", "bhaiya", "yaar", "bro", "sir", "madam", "didi", "ji", "ok", "okay", "hello", "hi", "hey", "team", "everyone", "please", "plz", "haan", "nahi", "abhi", "kal", "aaj", "client", "boss"]);
const RELAY_ACTION_HINT = /\b(?:kare|karein|kar\s+(?:de|dena|do|le|lena|dein)|karna|karo|bheje|bhejo|bhej\s+(?:de|dena|do)|bhejna|de\s+(?:de|dena|do)|complete|send|share|submit|finish|update|call|check|prepare|finali[sz]e)\b/iu;
/** "Neha ko bol do presentation complete kare": Neha is the one who must act. */
function extractRelayAction(body) {
  const match = String(body ?? "").match(/(?:^|[.!?]\s+)(?<name>\p{Lu}[\p{L}\p{M}'’.-]*)\s+ko\s+(?:bol\s+do|bolo|bol\s+dena|bolna|keh\s+do|kehna|keh\s+dena)\s+(?:ki\s+)?(?<rest>[^.!?\n]+)/u);
  if (!match) return null;
  const name = match.groups.name;
  const rest = match.groups.rest.trim();
  if (NON_NAME_WORDS.has(name.toLocaleLowerCase()) || RESERVED_SPEAKERS.has(name.toLocaleLowerCase())) return null;
  // Telling someone a fact ("Rahul ko bol do meeting kal hai") is not a task.
  if (!rest || !RELAY_ACTION_HINT.test(rest)) return null;
  return { text: rest, owner: name, classification: "assigned_task", origin: "hinglish_relay" };
}

function extractOverdueFollowup(body) {
  const pattern = new RegExp(
    String.raw`^(?:(?<owner>${PERSON_NAME_SOURCE})\s+)?(?:you|u)\s+(?:were|was)\s+supposed\s+to\s+(?<action>(?:${TASK_VERB_SOURCE})\b[\s\S]*)$`,
    "iu",
  );
  const match = String(body ?? "").trim().match(pattern);
  if (!match?.groups?.action) return null;
  const actionText = match.groups.action
    .replace(/,\s*(?:still waiting|still pending|waiting for (?:the )?reply|following up|just following up)[\s\S]*$/iu, "")
    .replace(/\s+\b(?:yesterday|today|tomorrow|aaj|kal\s+tak)\b[\s\S]*$/iu, "")
    .trim()
    .replace(/[.!?]+$/u, "");
  return {
    text: actionText,
    owner: match.groups.owner?.trim() || null,
    classification: match.groups.owner ? "assigned_task" : "unassigned_request",
    origin: "overdue_followup",
  };
}

function extractSelfCommitment(body, speaker) {
  const matches = [...body.matchAll(new RegExp(COMMITMENT_REGEX.source, "giu"))]
    .filter((match) => !isNegatedAt(body, match.index));
  if (!matches.length || /^\s*(?:decision:|agreed\s+decision:)/iu.test(body)) return null;
  const first = matches[0];
  const pronoun = first.groups?.pronoun || first[1];
  const verb = first.groups?.verb || first[2];
  const verbIndex = first.index + first[0].lastIndexOf(verb);
  const actionText = body.slice(verbIndex).replace(/[\s.!?;,:-]+$/u, "").trim();
  if (!actionText) return null;
  const isIndividual = pronoun.toLocaleLowerCase() === "i";
  return {
    text: actionText,
    owner: isIndividual ? (speaker || null) : null,
    classification: isIndividual && speaker ? "self_commitment" : "unassigned_action",
    origin: "self_commitment",
  };
}

function inferAssignee(line) {
  const explicitOwner = line.match(
    new RegExp(
      String.raw`\b(?:assigned\s+to|assign\s+to|owner|assignee|task\s+for)\s*[:=]?\s*(@?${HANDLE_SOURCE})`,
      "iu"
    )
  );
  if (explicitOwner) return explicitOwner[1];
  const directRequest = line.match(
    new RegExp(
      String.raw`(?:^|[^\p{L}\p{N}._%+-])@(${HANDLE_SOURCE})(?:\s*:\s*|\s+)(?:(?:please|can you|could you|to)\s+)?(?:${TASK_VERB_SOURCE})\b`,
      "iu"
    )
  );
  return directRequest ? `@${directRequest[1]}` : null;
}

function hasActionDirective(line) {
  const labelMatch = ACTION_LABEL_REGEX.exec(line);
  if (labelMatch) {
    const content = labelMatch[1].trim();
    const isNegatedAction = /^(?:no\b|not\b|never\b|don't\b|don’t\b|do not\b|does not\b|is not\b|isn't\b|isn’t\b)/i.test(content);
    return content.length > 0 && !isNegatedAction;
  }
  if (extractSelfCommitment(line, null)) return true;
  const patterns = [REQUEST_REGEX, MODAL_DIRECTIVE_REGEX, IMPERATIVE_REGEX];
  return patterns.some((pattern) => hasUnnegatedPattern(line, pattern));
}

function extractDueSignal(text, { allowCommitmentTiming = true } = {}) {
  const unique = extractTimingSignals(String(text ?? ""), { allowCommitmentTiming });
  return unique.length ? unique.join(", ") : null;
}

function dueDateStatusForAction(actionText, dueDate, sourceBody = "") {
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

function taskClassificationFor(body, candidate) {
  if (candidate.classification) return candidate.classification;
  if (candidate.owner) return "assigned_task";
  if (/\b(?:can|could|would)\s+(?:you|someone|anyone|somebody)\b/iu.test(body)) return "unassigned_request";
  return "unassigned_action";
}

function matchesAcknowledgement(body) {
  return /^\s*(?:(?:sure|yes|yep|ok(?:ay)?|alright|absolutely)[,!\s]+)?(?:i['’]?m\s+on\s+it|i\s+am\s+on\s+it|on\s+it|will\s+do|i['’]?ll\s+(?:do\s+it|take\s+it)|got\s+it|consider\s+it\s+done|i\s+can\s+handle\s+that)[.!\s]*$/iu.test(body)
    // Hinglish: "Ok sir, kar deta hu", "ho jayega", "kar dunga". A bare "ok" is NOT an acknowledgement.
    || /^\s*(?:(?:ok(?:ay)?|theek\s+hai|thik\s+hai|haan|ji|yes)[,\s]+)*(?:(?:sir|boss|bhai|ji)[,\s]+)?(?:kar\s+(?:deta|dunga|dungi|deti|denge)(?:\s+(?:hu|hoon|hun))?|ho\s+(?:jayega|jaega|jaayega)|kar\s+dun(?:ga|gi)|karta\s+(?:hu|hoon|hun)|kar\s+raha\s+(?:hu|hoon|hun)|kar\s+leta\s+(?:hu|hoon|hun))[.!\s]*$/iu.test(body);
}

function ownerMatchesSpeaker(owner, speaker) {
  if (!owner || !speaker) return false;
  const ownerName = owner.replace(/^@/, "").trim().toLocaleLowerCase();
  const speakerName = speaker.trim().toLocaleLowerCase();
  if (ownerName === speakerName) return true;
  const firstOwnerToken = ownerName.split(/\s+/)[0];
  const firstSpeakerToken = speakerName.split(/\s+/)[0];
  return firstOwnerToken.length > 1 && firstOwnerToken === firstSpeakerToken;
}

const RELATION_STOP_WORDS = new Set([
  "the", "a", "an", "to", "in", "on", "at", "by", "before", "after", "for", "with", "from", "and", "or", "but", "that", "this", "it", "we", "i", "ill", "i'll", "can", "will", "shall", "please", "you", "my", "your", "our", "their", "his", "her", "me", "us", "them", "as", "is", "are", "was", "were", "be", "been", "being", "of", "into", "over", "under", "up", "down", "once", "when", "if", "until", "unless", "after", "got", "sure", "yes", "okay", "ok", "understood", "thanks", "thank", "i", "ll", "by", "pm", "am", "today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "morning", "afternoon", "evening", "noon", "update", "task", "item", "client", "customer",
]);
const TASK_VERB_SET = new Set(TASK_VERBS.flatMap((verb) => verb.toLowerCase().split(/\s+/)));

function relationTokens(text) {
  return new Set(String(text ?? "").toLocaleLowerCase()
    .replace(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/giu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token)
    .filter((token) => token.length > 2 && !RELATION_STOP_WORDS.has(token) && !TASK_VERB_SET.has(token)));
}

function relationScore(left, right) {
  const a = relationTokens(left);
  const b = relationTokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}

function conditionFor(body) {
  const match = String(body ?? "").match(/\b(?:once|after|when|if|until|unless|provided\s+that|subject\s+to)\s+(?:we\s+get\s+)?(?:the\s+)?(?:client|customer|legal|qa|approval|reply|response|wording|sign[- ]?off)[^.!?]*/iu);
  return match ? match[0].trim().replace(/[.!?]+$/u, "") : null;
}

function extractBlockedPrecondition(body) {
  const pattern = new RegExp(
    String.raw`\b(?:I|we)\s+(?:won['’]t|will\s+not|cannot|can['’]t|should\s+not|shouldn['’]t)\s+(?<action>(?:${TASK_VERB_SOURCE})\b[\s\S]*?)\s+until\s+(?<condition>[^.!?]+)`,
    "iu",
  );
  const match = String(body ?? "").match(pattern);
  if (!match?.groups?.action || !match?.groups?.condition) return null;
  return {
    actionText: match.groups.action.trim(),
    condition: `until ${match.groups.condition.trim()}`,
  };
}

function hasConditionStateMatch(source, pattern) {
  const regex = new RegExp(pattern.source, "giu");
  let match;
  while ((match = regex.exec(source)) !== null) {
    const matchedText = match[0];
    const prefix = source.slice(Math.max(0, match.index - 48), match.index);
    const isHypothetical = /\b(?:until|once|if|after|when|unless|provided\s+that|subject\s+to|waiting\s+for|awaiting)\s*[^.!?]{0,44}$/iu.test(prefix);
    const isNegated = /\b(?:not|never|no\s+longer|has\s+not|have\s+not|had\s+not|is\s+not|are\s+not|was\s+not|were\s+not|not\s+yet)\b/iu.test(matchedText) ||
      /\b(?:not|never|has\s+not|have\s+not|had\s+not|is\s+not|are\s+not|was\s+not|were\s+not|not\s+yet)\s*$/iu.test(prefix);
    if (!isHypothetical && !isNegated) return true;
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return false;
}

function conditionEvidenceStatus(body, condition) {
  const source = String(body ?? "").toLocaleLowerCase();
  const requirement = String(condition ?? "").toLocaleLowerCase();

  if (/\b(?:legal|qa|compliance|approval|approves|approved|sign[- ]?off|wording)\b/u.test(requirement)) {
    // Evidence may come from Legal, Compliance, QA, or another participant
    // explicitly reporting the approval state. Do not require the speaker to
    // be the task owner: cross-speaker condition updates are expected.
    const explicitOverride = hasExplicitConditionOverride(source);
    const pendingNegation = /\b(?:not yet approved|not approved yet|awaiting approval|approval is pending|approval remains pending|still awaiting (?:legal )?approval)\b/iu.test(source);
    const negativeApproval = !pendingNegation && (
      /\b(?:the\s+)?(?:wording|approval|sign[- ]?off)\s+(?:(?:has|have|had)\s+)?(?:not|never)\s+(?:yet\s+)?(?:been\s+)?approved\b/iu.test(source)
      || /\b(?:legal|qa|compliance)\s+(?:(?:has|have|had|is|was|were)\s+)?(?:not|never)\s+approved\b/iu.test(source)
      || /\bnot\s+(?:yet\s+)?approved\b/iu.test(source)
    );
    const approved = hasConditionStateMatch(source, /\b(?:legal|qa|compliance)\s+(?:(?:has|have|had|is|was|were)\s+)?(?:approved|approves|signed\s+off|cleared|passed)\b|\b(?:approved|signed\s+off|cleared|passed)\s+by\s+(?:legal|qa|compliance)\b|\bapproval\s+(?:(?:was|is|has\s+been|has)\s+)?(?:received|granted)\b|\b(?:wording|sign[- ]?off)\s+(?:(?:has\s+been|was|is)\s+)?approved\b/iu);
    const rejected = negativeApproval || hasConditionStateMatch(source, /\b(?:legal|qa|compliance)\s+(?:(?:has|have|had|is|was|were)\s+)?(?:rejected|denied|declined|refused|failed|revoked|withdrew|rescinded|reversed|overturned)\b|\b(?:rejected|denied|declined|refused|failed|revoked|withdrawn|rescinded|reversed|overturned)\s+by\s+(?:legal|qa|compliance)\b|\b(?:approval|sign[- ]?off)\s+(?:(?:is|was|has\s+been|has)\s+)?(?:rejected|denied|refused|revoked|withdrawn|rescinded|reversed|overturned)\b|\b(?:revoked|withdrew|rescinded|reversed|overturned)\s+(?:the\s+)?(?:approval|sign[- ]?off)\b|\b(?:wording|sign[- ]?off)\s+(?:(?:was|is|has\s+been)\s+)?(?:rejected|denied|declined|refused)\b/iu);

    if (approved && rejected) {
      // A single explicit correction/revocation makes the current state clear;
      // otherwise a message containing both states is intrinsically ambiguous.
      if (explicitOverride && rejected) return "reported_rejected";
      return "ambiguous";
    }
    if (rejected) return "reported_rejected";
    if (approved) return "reported_satisfied";
    return null;
  }

  if (/\b(?:client|customer|reply|response)\b/u.test(requirement)) {
    const responded = hasConditionStateMatch(source, /\b(?:client|customer)\s+(?:(?:has|have)\s+)?(?:responded|replied|confirmed|got\s+back|declined|rejected)\b|\b(?:response|reply)\s+(?:was\s+)?received\b|\b(?:responded|replied|confirmed|got\s+back)\s+by\s+(?:the\s+)?(?:client|customer)\b/iu);
    return responded ? "reported_satisfied" : null;
  }

  return null;
}

function hasExplicitConditionOverride(body) {
  return /\b(?:correction|retraction|revoked|revokes|withdrew|withdrawn|rescinded|rescinds|reversed|overturned|no\s+longer\s+approved|approval\s+(?:(?:is|was|has\s+been|has)\s+)?(?:no\s+longer\s+valid|withdrawn|revoked|rescinded|reversed)|(?:withdrawn|revoked|rescinded|reversed)\s+approval|changed\s+(?:its|the)\s+(?:approval|decision))\b/iu.test(String(body ?? ""));
}

function resolveConditionAcrossConversation(records, precondition) {
  const evidence = records
    .filter((record) => record.startOffset > precondition.record.startOffset)
    .map((record) => {
      const body = recordMeta(record).body;
      return {
        record,
        status: conditionEvidenceStatus(body, precondition.condition),
        body,
        explicitOverride: hasExplicitConditionOverride(body),
      };
    })
    .filter((item) => item.status)
    .sort((left, right) => left.record.startOffset - right.record.startOffset);

  if (!evidence.length) {
    return { status: "pending_verification", evidence: [] };
  }

  const states = new Set(evidence.map((item) => item.status));
  if (states.has("ambiguous")) {
    return { status: "ambiguous", evidence };
  }

  if (states.has("reported_satisfied") && states.has("reported_rejected")) {
    const latest = evidence[evidence.length - 1];
    // A clearly marked correction/revocation supersedes the earlier state.
    // A merely later contradictory statement remains ambiguous.
    if (latest.explicitOverride) {
      return { status: latest.status, evidence };
    }
    return { status: "ambiguous", evidence };
  }

  return { status: states.has("reported_rejected") ? "reported_rejected" : "reported_satisfied", evidence };
}

function addSupportingDetail(action, record, body, kind = "detail") {
  action.supportingDetails ||= [];
  const key = body.toLocaleLowerCase();
  if (!action.supportingDetails.some((item) => item.text.toLocaleLowerCase() === key)) {
    action.supportingDetails.push({ text: body, sourceSpan: sourceSpan(record), kind });
  }
}

function findUniquePriorAction(actions, owner, text, record, { minimumScore = 0.28 } = {}) {
  const matches = actions
    .filter((action) => action.owner && ownerMatchesSpeaker(action.owner, owner) && action.sourceSpan.startOffset < record.startOffset)
    .map((action) => ({ action, score: relationScore(action.text, text) }))
    .filter((item) => item.score >= minimumScore)
    .sort((a, b) => b.score - a.score);
  if (!matches.length) return null;
  if (matches.length > 1 && matches[0].score - matches[1].score < 0.12) return null;
  return matches[0].action;
}

function extractNamedFollowupTarget(body) {
  const match = String(body ?? "").match(/\b(?:thanks|thank\s+you)\s+(@?\p{L}[\p{L}\p{M}'’'-]*)/iu);
  return match?.[1]?.trim() || null;
}

function isUpdateDetail(body) {
  return /\b(?:include|add|mention|attach)\b[\s\S]*\b(?:your|the)\s+update\b/iu.test(body);
}

function hasDecisionSignal(line) {
  return /(?:\bagreed\s+on\b|\bagreed\s+decision\s*:|\bdecision\s*:|\bdecided\s+that\b|\bdecided\s+to\b|\bwe\s+decided\b)/iu.test(String(line ?? ""));
}

function lifecycleEventType(body) {
  const value = String(body ?? "").trim();
  if (!value || isNegatedAt(value, Math.max(0, value.search(/\b(?:done|completed|cancel|sent|submitted|finished|fixed)\b/iu)))) return null;

  if (/\b(?:reassign(?:ed|ment)?|transfer(?:red)?|hand(?:ing)?\s+over|take\s+over|taking\s+over|instead\s+of)\b/iu.test(value)
    || /\b(?:will|can|is\s+now\s+going\s+to)\s+(?:handle|own)\b/iu.test(value)) return "reassigned";
  if (/\b(?:cancel(?:led|ed)?|scrap(?:ped)?|drop\s+this|no\s+longer\s+needed|not\s+needed\s+anymore|cancel\s+kar\s+do|mat\s+(?:bhejo|karo))\b/iu.test(value)) return "cancelled";
  if (/\b(?:hold\s+(?:pe|par|on)|on\s+hold|put\s+(?:this\s+)?on\s+hold|paused?|rok\s+(?:do|dena|ke\s+rakho)|abhi\s+mat\s+(?:karo|bhejo|bhejna))\b/iu.test(value)) return "blocked";
  if (/\b(?:approval\s+(?:de\s+diya|mil\s+gaya|mil\s+gayi|aa\s+gaya)|approved\s+by\s+(?:the\s+)?client|off\s+hold|resume|unblock(?:ed)?|ab\s+kar\s+sakte\s+ho)\b/iu.test(value)) return "unblocked";
  if (/\bab\s+@?[\p{L}][\p{L}\p{M}'’.-]*\s+(?:karega|karegi|karenge|sambhalega|sambhalegi|dekhega|dekhegi)\b/iu.test(value)) return "reassigned";
  if (/\b(?:not\s+yet\s+done|not\s+done|isn't\s+done|isn’t\s+done|still\s+pending|not\s+completed)\b/iu.test(value)) return null;
  if (/^(?:done|completed|complete|finished|sent|shared|submitted|uploaded|fixed|resolved|booked|delivered|mailed|closed|approved)(?:\b|[.!✅✔])/iu.test(value)
    || /\b(?:has\s+been|have\s+been|is|was)\s+(?:sent|shared|submitted|uploaded|fixed|resolved|booked|delivered|completed|finished|approved)\b/iu.test(value)
    || /\b(?:i|we)\s+(?:have\s+)?(?:sent|shared|submitted|uploaded|fixed|resolved|booked|delivered|completed|finished|approved)\b/iu.test(value)
    || /\b[\p{L}\p{N}][\p{L}\p{N}'’_-]{1,}\s+(?:sent|shared|submitted|uploaded|fixed|resolved|booked|delivered|completed|finished|approved)\b/iu.test(value)
    || /\b(?:ho\s+gaya|bhej\s+diya|send\s+kar\s+diya|share\s+kar\s+diya|submit\s+kar\s+diya|complete\s+kar\s+diya|kar\s+diya)\b/iu.test(value)) return "completed";
  if (/\b(?:delay(?:ed)?|postpon(?:e|ed)|pushing\s+(?:it\s+)?to|moving\s+(?:it\s+)?to|running\s+late|not\s+ready|can't\s+make\s+it|cannot\s+make\s+it|kal\s+tak\s+possible\s+nahi)\b/iu.test(value)) return "delayed";
  if (/\b(?:working\s+on|started\s+(?:working\s+on|it)|in\s+progress|currently\s+handling|taking\s+care\s+of|looking\s+into|kaam\s+kar\s+raha|kaam\s+chal\s+raha)\b/iu.test(value)) return "in-progress";
  return null;
}

function extractReassignmentOwner(body) {
  const value = String(body ?? "");
  const patterns = [
    /\b(?:reassign(?:ed|ing)?|transfer(?:red|ring)?|assign(?:ed|ing)?)\b[\s\S]{0,64}?\bto\s+(@?[\p{L}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}][\p{L}\p{M}'’.-]*)?)/iu,
    /\b(@?[\p{L}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}][\p{L}\p{M}'’.-]*)?)\s+(?:will|can|is\s+now\s+going\s+to)\s+(?:take\s+over|handle|own)\b/iu,
    /\b(@?[\p{L}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}][\p{L}\p{M}'’.-]*)?)\s*,?\s+(?:please\s+)?take\s+over\b/iu,
    /\bab\s+(@?[\p{L}][\p{L}\p{M}'’.-]*)\s+(?:karega|karegi|karenge|sambhalega|sambhalegi|dekhega|dekhegi)\b/iu,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      const owner = match[1].trim().replace(/[.,;:]+$/u, "");
      if (!RESERVED_SPEAKERS.has(owner.toLocaleLowerCase())) return owner;
    }
  }
  return null;
}

function extractLifecycleDuePhrase(body) {
  const value = String(body ?? "");
  const explicit = value.match(/\b(?:until|till|by|before|move(?:d)?\s+to|shift(?:ed)?\s+to|push(?:ed)?\s+to)\s+((?:day\s+after\s+tomorrow|tomorrow|today|kal\s+tak|aaj|next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?(?:\s*,?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))?)\b/iu);
  if (explicit?.[1]?.trim()) return explicit[1].trim();
  const relative = value.match(/\b(day\s+after\s+tomorrow|tomorrow|kal\s+tak|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/iu);
  return relative?.[1] || null;
}

function chooseLifecycleTarget(actions, record, body, speaker, eventType, options) {
  const available = actions.filter((action) => action.sourceSpan.startOffset < record.startOffset
    && !["completed", "cancelled"].includes(action.lifecycleStatus));
  const scored = available.map((action) => ({ action, score: relationScore(action.text, body) }))
    .filter((item) => item.score >= (options.lifecycleMatchThreshold ?? 0.5))
    .sort((left, right) => right.score - left.score);
  if (scored.length) {
    if (scored.length > 1 && scored[0].score - scored[1].score < 0.12) return null;
    return scored[0].action;
  }

  // A bare acknowledgement/completion is safe only when one open task belongs
  // to this speaker. Never attach a context-free status to an arbitrary task.
  if (matchesAcknowledgement(body) || /^(?:done|completed|finished|sent|submitted|on\s+it|i['’]?m\s+on\s+it|i\s+am\s+on\s+it|will\s+do)[.!\s✅✔]*$/iu.test(body)) {
    const owned = available.filter((action) => action.owner && ownerMatchesSpeaker(action.owner, speaker));
    return owned.length === 1 ? owned[0] : null;
  }

  // The speaker's own status report with a weaker content match: accept only
  // when they own exactly one open task AND share at least one content word
  // ("Invoice bhej diya hai" -> their one open invoice task).
  if (["completed", "in-progress", "delayed"].includes(eventType) && speaker) {
    const owned = available.filter((action) => action.owner && ownerMatchesSpeaker(action.owner, speaker));
    if (owned.length === 1 && relationScore(owned[0].text, body) > 0) return owned[0];
  }
  return null;
}

const PRONOUN_OBJECTS = new Set(["it", "this", "that", "them", "these", "those", "isse", "ise", "usse", "use", "yeh", "ye", "woh", "wo"]);
const DEADLINE_WORDS = new Set(["tomorrow", "today", "tonight", "kal", "parso", "aaj", "tak", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "morning", "evening", "eod", "week", "weekend", "next", "later"]);
const DELAY_CUE = /\b(?:nahi\s+(?:bheji|bheja|bheje|aaya|aayi|aaye|mila|mili|mile|diya|di)|abhi\s+tak\s+nahi|pending\s+hai|late\s+ho|missing|pending|waiting\s+(?:for|on)|not\s+(?:ready|received)|blocked|delay(?:ed)?|running\s+late|haven['’]?t\s+(?:received|got))\b/iu;

function statusForEvent(type, action) {
  // Unblocking returns the task to active work; it is not a status of its own.
  if (type === "unblocked") return action.owner ? "assigned" : "open";
  return type;
}

function applyTaskLifecycle(actions, records, options = {}) {
  for (const action of actions) {
    action.lifecycleStatus = action.owner ? "assigned" : "open";
    action.lifecycleEvents = [];
    action.completed = false;
    action.cancelled = false;
  }

  const appendEvent = (action, event) => {
    action.lifecycleEvents.push(event);
    addSupportingDetail(action, { startOffset: event.sourceSpan.startOffset, endOffset: event.sourceSpan.endOffset }, event.text, `lifecycle:${event.type}`);
  };

  for (const record of records) {
    const { speaker, body, timestamp } = recordMeta(record, options);
    if (!body) continue;

    // The acknowledgement association was already resolved conservatively by
    // extractActions. Convert that exact evidence into a lifecycle event.
    const acknowledged = actions.find((action) => action.acknowledgementSpan?.startOffset === record.startOffset);
    if (acknowledged) {
      const event = {
        type: "acknowledged", actor: speaker || acknowledged.acknowledgedBy || null,
        text: body, sourceSpan: sourceSpan(record), messageTimestamp: timestamp?.raw || null,
        messageDate: timestamp?.date || null,
      };
      appendEvent(acknowledged, event);
      if (!["completed", "cancelled"].includes(acknowledged.lifecycleStatus)) acknowledged.lifecycleStatus = "acknowledged";
      continue;
    }

    // Reassignment may change the owner after the first acknowledgement pass.
    // Resolve later acknowledgements against the current owner state here.
    if (speaker && matchesAcknowledgement(body)) {
      const currentOwnerTasks = actions.filter((action) => action.sourceSpan.startOffset < record.startOffset
        && ownerMatchesSpeaker(action.owner, speaker)
        && !["completed", "cancelled"].includes(action.lifecycleStatus));
      if (currentOwnerTasks.length === 1) {
        const [action] = currentOwnerTasks;
        const event = {
          type: "acknowledged", actor: speaker, text: body,
          sourceSpan: sourceSpan(record), messageTimestamp: timestamp?.raw || null,
          messageDate: timestamp?.date || null,
        };
        appendEvent(action, event);
        action.acknowledgedBy = speaker;
        action.acknowledgementText = body;
        action.acknowledgementSpan = sourceSpan(record);
        action.lifecycleStatus = "acknowledged";
        continue;
      }
    }

    // Delay-with-new-date update: "Client details are missing. I'll send it
    // tomorrow." re-commits the SAME work instead of creating a new task. Merge
    // only when the speaker owns exactly one open task whose verb matches;
    // otherwise leave everything as-is rather than guess.
    if (speaker && DELAY_CUE.test(body)) {
      const commitment = extractSelfCommitment(body, speaker);
      // The extractor may or may not have emitted a separate task for this
      // message (it often folds it into the original), so the merge works from
      // the message itself and treats the orphan as optional cleanup.
      const orphan = actions.find((action) => action.classification === "self_commitment"
        && ownerMatchesSpeaker(action.owner, speaker)
        && action.sourceSpan.startOffset >= record.startOffset
        && action.sourceSpan.endOffset <= record.endOffset) || null;
      const duePhrase = commitment?.owner ? extractLifecycleDuePhrase(body) : null;
      if (duePhrase) {
        const verb = commitment.text.trim().split(/\s+/u)[0]?.toLocaleLowerCase();
        const deliverable = [...relationTokens(commitment.text)].filter((token) => !DEADLINE_WORDS.has(token) && !PRONOUN_OBJECTS.has(token));
        const ownedOpen = actions.filter((action) => action !== orphan
          && action.sourceSpan.startOffset < record.startOffset
          && ownerMatchesSpeaker(action.owner, speaker)
          && !["completed", "cancelled"].includes(action.lifecycleStatus));
        // Identity = deliverable, not verb. "send the quotation" must never
        // attach to "send the invoice". With only a pronoun ("send it"), the
        // speaker must have exactly one open task at all.
        const candidates = deliverable.length
          ? ownedOpen.filter((action) => {
              const tokens = relationTokens(action.text);
              return deliverable.some((token) => tokens.has(token));
            })
          : (ownedOpen.length === 1 && verb && new RegExp(`\\b${escapeRegex(verb)}\\b`, "iu").test(ownedOpen[0].text) ? ownedOpen : []);
        if (candidates.length === 1) {
          const [target] = candidates;
          const event = {
            type: "delayed", actor: speaker, text: body, sourceSpan: sourceSpan(record),
            messageTimestamp: timestamp?.raw || null, messageDate: timestamp?.date || null,
            previousDueDate: target.dueDate || null, dueDate: duePhrase,
            resolvedDueDate: resolveDeadlineDate(duePhrase, timestamp?.date || null, options),
          };
          target.originalDueDate = target.originalDueDate ?? (target.dueDate || null);
          target.originalResolvedDueDate = target.originalResolvedDueDate ?? (target.resolvedDueDate || null);
          target.dueDate = duePhrase;
          target.resolvedDueDate = event.resolvedDueDate;
          target.dueDateStatus = "contextual";
          target.lifecycleStatus = "delayed";
          appendEvent(target, event);
          if (orphan) actions.splice(actions.indexOf(orphan), 1);
          continue;
        }
      }
    }

    const eventType = lifecycleEventType(body);
    if (!eventType) continue;
    let target = chooseLifecycleTarget(actions, record, body, speaker, eventType, options);
    if (!target && eventType === "reassigned") {
      // "Banner ka kaam ab Rohan karega, Neha ko ye nahi karna": the previous
      // owner is named, so use them to find the task, but only if it is unique
      // and shares at least one content word with the message.
      const previous = body.match(/(\p{Lu}[\p{L}\p{M}'’.-]*)\s+ko\s+(?:ye|yeh|ise|isse)\s+nahi\s+karna\b/u)?.[1];
      if (previous) {
        const owned = actions.filter((action) => action.sourceSpan.startOffset < record.startOffset
          && !["completed", "cancelled"].includes(action.lifecycleStatus)
          && ownerMatchesSpeaker(action.owner, previous)
          && relationScore(action.text, body) > 0);
        if (owned.length === 1) target = owned[0];
      }
    }
    if (!target) continue;
    if (eventType === "unblocked" && target.lifecycleStatus !== "blocked") continue;
    // A first-person progress/completion report from someone other than the
    // owner must not close the owner's task, unless the message names the owner
    // ("Priya sent the invoice"). Leaving it untouched is safer than guessing.
    if (["completed", "in-progress"].includes(eventType) && target.owner && speaker
      && !ownerMatchesSpeaker(target.owner, speaker)
      && !new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(String(target.owner).replace(/^@/u, ""))}(?![\\p{L}\\p{N}])`, "iu").test(body)) continue;

    const event = {
      type: eventType,
      actor: speaker || null,
      text: body,
      sourceSpan: sourceSpan(record),
      messageTimestamp: timestamp?.raw || null,
      messageDate: timestamp?.date || null,
    };

    if (eventType === "reassigned") {
      const nextOwner = extractReassignmentOwner(body);
      if (!nextOwner || ownerMatchesSpeaker(target.owner, nextOwner)) continue;
      event.previousOwner = target.owner || null;
      event.newOwner = nextOwner;
      target.owner = nextOwner;
      target.classification = "assigned_task";
      target.ownerSource = "conversation_reassignment";
      target.lifecycleStatus = "reassigned";
    } else if (eventType === "delayed") {
      const duePhrase = extractLifecycleDuePhrase(body);
      if (duePhrase) {
        event.dueDate = duePhrase;
        event.resolvedDueDate = resolveDeadlineDate(duePhrase, timestamp?.date || null, options);
        target.dueDate = duePhrase;
        target.resolvedDueDate = event.resolvedDueDate;
        target.dueDateStatus = "contextual";
      }
      target.lifecycleStatus = "delayed";
    } else {
      target.lifecycleStatus = statusForEvent(eventType, target);
      if (eventType === "completed") target.completed = true;
      if (eventType === "cancelled") {
        target.cancelled = true;
        // "Cancel the logo request" is a control message, not a new task.
        for (const other of [...actions]) {
          if (other !== target && other.sourceSpan.startOffset >= record.startOffset && other.sourceSpan.endOffset <= record.endOffset
            && /^(?:please\s+)?(?:cancel|scrap|drop)\b/iu.test(other.text)) {
            actions.splice(actions.indexOf(other), 1);
          }
        }
      }
    }
    appendEvent(target, event);
  }

  for (const action of actions) {
    action.lifecycleEvents.sort((left, right) => left.sourceSpan.startOffset - right.sourceSpan.startOffset);
    const latest = action.lifecycleEvents.at(-1);
    if (latest && !["completed", "cancelled"].includes(action.lifecycleStatus)) {
      action.lifecycleStatus = statusForEvent(latest.type, action);
    }
  }
  return actions;
}

export function extractActions(text, options = {}) {
  options = resolveParseOptions(text, options);
  const actions = [];
  const decisions = [];
  const decisionEvidence = [];
  const blockedPreconditions = [];
  const records = conversationMessageRecords(text, options).filter((record) => record.text);

  for (const record of records) {
    const line = record.text;
    const { speaker, body } = recordMeta(record, options);

    const blockedPrecondition = speaker ? extractBlockedPrecondition(body) : null;
    if (blockedPrecondition) {
      blockedPreconditions.push({ ...blockedPrecondition, speaker, body, record });
    }

    if (hasDecisionSignal(body)) {
      decisions.push(line);
      decisionEvidence.push({ text: line, sourceSpan: sourceSpan(record) });
      // An explicit decision statement is not a commitment/task merely because
      // it contains a future-tense verb (e.g. "Decision: we'll publish...").
      if (/^\s*(?:decision:|agreed\s+decision:)/iu.test(body)) continue;
    }

    // A follow-up such as "Thanks Raj. Please include endpoints in your update"
    // refines the uniquely identified prior task; it is not a second task.
    const followupTarget = extractNamedFollowupTarget(body);
    if (followupTarget && isUpdateDetail(body)) {
      const prior = actions.filter((action) => action.owner && ownerMatchesSpeaker(action.owner, followupTarget) && action.sourceSpan.startOffset < record.startOffset);
      if (prior.length === 1) {
        addSupportingDetail(prior[0], record, body, "update-detail");
        continue;
      }
    }

    let candidates = extractBulletAssignments(body);
    if (!candidates.length) candidates = directAddressActions(body);

    if (!candidates.length) {
      const relay = extractRelayAction(body);
      if (relay) candidates = [relay];
    }

    if (!candidates.length) {
      const overdueFollowup = extractOverdueFollowup(body);
      if (overdueFollowup) candidates = [overdueFollowup];
    }

    if (!candidates.length) {
      const hinglishAction = extractHinglishAction(body);
      if (hinglishAction) candidates = [hinglishAction];
    }

    if (!candidates.length) {
      const selfCommitment = extractSelfCommitment(body, speaker);
      if (selfCommitment) candidates = [selfCommitment];
    }

    if (!candidates.length) {
      const mentionOwner = inferAssignee(body);
      if (mentionOwner && hasActionDirective(body)) {
        candidates = [{
          text: body.replace(/^@?[\p{L}\p{N}_.-]+\s*/u, "").trim() || body,
          owner: mentionOwner,
          classification: "assigned_task",
        }];
      }
    }

    if (!candidates.length && hasActionDirective(body)) {
      const actionLabel = ACTION_LABEL_REGEX.exec(body);
      const fallbackText = actionLabel ? actionLabel[1].trim() : body;
      if (fallbackText) {
        const request = /\b(?:can|could|would)\s+(?:you|someone|anyone|somebody)\b/iu.test(body);
        candidates = [{ text: fallbackText, owner: null, classification: request ? "unassigned_request" : "unassigned_action" }];
      }
    }

    const dueDate = extractDueSignal(body, { allowCommitmentTiming: true });
    const condition = conditionFor(body);

    candidates.forEach((candidate, index) => {
      const candidateText = candidate.text.trim();
      if (!candidateText) return;
      const messageMeta = record.meta ?? parseChatRecord(String(record.rawText ?? line).split(/\r?\n/u)[0], options);
      const action = {
        id: `task-${record.ordinal}-${index}-${candidateText.slice(0, 16)}`,
        text: candidateText,
        sourceText: record.rawText || line,
        messageTimestamp: messageMeta.timestamp?.raw || null,
        messageDate: messageMeta.timestamp?.date || null,
        owner: candidate.owner || null,
        classification: taskClassificationFor(body, candidate),
        dueDate,
        resolvedDueDate: dueDate ? resolveDeadlineDate(dueDate, messageMeta.timestamp?.date || null, options) : null,
        dueDateStatus: dueDate ? dueDateStatusForAction(candidateText, dueDate, body) : null,
        urgency: urgencyFor(body),
        condition,
        conditionStatus: condition ? "pending_verification" : null,
        supportingDetails: [],
        completed: false,
        sourceSpan: sourceSpan(record),
      };

      // Carry a previously blocked condition forward only when the same
      // speaker later commits to the same action and the relationship is unique.
      // The earlier negative statement is evidence/context, never a task itself.
      const preconditionMatches = blockedPreconditions
        .filter((item) => item.record.startOffset < record.startOffset && ownerMatchesSpeaker(item.speaker, action.owner))
        .map((item) => ({ item, score: relationScore(item.actionText, action.text) }))
        .filter((entry) => entry.score >= 0.5)
        .sort((left, right) => right.score - left.score);
      if (preconditionMatches.length && (preconditionMatches.length === 1 || preconditionMatches[0].score - preconditionMatches[1].score >= 0.12)) {
        const matchedPrecondition = preconditionMatches[0].item;
        action.condition ||= matchedPrecondition.condition;
        const conditionResolution = resolveConditionAcrossConversation(records, matchedPrecondition);
        action.conditionStatus = conditionResolution.status;
        addSupportingDetail(action, matchedPrecondition.record, matchedPrecondition.body, "precondition-context");
        for (const resolution of conditionResolution.evidence) {
          const isSuperseded = conditionResolution.status !== "ambiguous"
            && resolution.status !== conditionResolution.status;
          const evidenceKind = isSuperseded
            ? `condition-resolution:superseded:${resolution.status}`
            : `condition-resolution:${resolution.status}`;
          addSupportingDetail(action, resolution.record, resolution.body, evidenceKind);
        }
      }

      // A later first-person commitment that repeats an already assigned task
      // is an acknowledgement/refinement, not a duplicate task. Match only
      // with the same identified owner and a strong, unique content overlap.
      const previous = action.owner
        ? findUniquePriorAction(actions, action.owner, action.text, record, { minimumScore: 0.30 })
        : null;
      if (previous) {
        const isAcknowledgement = /^(?:got\s+it|understood|yes|sure|okay|ok|noted|thanks|thank\s+you)\b/iu.test(body);
        if (isAcknowledgement || candidate.origin === "self_commitment") {
          if (!previous.dueDate && action.dueDate) {
            previous.dueDate = action.dueDate;
            previous.dueDateStatus = action.dueDateStatus;
          }
          if (!previous.condition && action.condition) previous.condition = action.condition;
          if (action.conditionStatus === "reported_satisfied") previous.conditionStatus = "reported_satisfied";
          else if (!previous.conditionStatus && action.conditionStatus) previous.conditionStatus = action.conditionStatus;
          addSupportingDetail(previous, record, body, isAcknowledgement ? "acknowledgement" : "refinement");
          if (isAcknowledgement) {
            previous.acknowledgedBy = speaker || action.owner;
            previous.acknowledgementText = body;
            previous.acknowledgementSpan = sourceSpan(record);
          }
          return;
        }
      }
      actions.push(action);
    });
  }

  // Link short acknowledgements that do not contain a repeated task phrase.
  for (const record of records) {
    const { speaker, body } = recordMeta(record, options);
    if (!speaker || !matchesAcknowledgement(body)) continue;
    let possibleMatches = actions.filter((action) =>
      action.sourceSpan.startOffset < record.startOffset && ownerMatchesSpeaker(action.owner, speaker)
    );
    if (possibleMatches.length === 0) {
      // A unique preceding unassigned request can acquire an owner when a
      // participant explicitly acknowledges it. Ambiguous cases stay unassigned.
      const unassigned = actions.filter((action) =>
        action.sourceSpan.startOffset < record.startOffset && !action.owner && !action.acknowledgedBy
      );
      if (unassigned.length === 1) {
        unassigned[0].owner = speaker;
        unassigned[0].classification = "assigned_task";
        unassigned[0].ownerSource = "unique_acknowledgement";
        possibleMatches = unassigned;
      }
    }
    if (possibleMatches.length !== 1) continue;
    const [action] = possibleMatches;
    action.acknowledgedBy = speaker;
    action.acknowledgementText = body;
    action.acknowledgementSpan = sourceSpan(record);
  }

  const uniqueActions = uniqueBy(actions, (item) => `${item.text.toLowerCase()}|${(item.owner || "").toLowerCase()}`);
  applyTaskLifecycle(uniqueActions, records, options);
  return {
    actions: uniqueActions,
    decisions: uniqueBy(decisions, (item) => item.toLowerCase()),
    decisionEvidence: uniqueBy(decisionEvidence, (item) => item.text.toLowerCase()),
  };
}

function buildSummary(
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
