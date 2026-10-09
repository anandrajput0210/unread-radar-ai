const URGENCY_TERMS = {
  High: [
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
  ],
  Medium: [
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
    "eod",
    "eow",
    "eoy",
    "follow up",
  ],
};

const TASK_VERBS = [
  "follow up",
  "pick up",
  "roll back",
  "send out",
  "reschedule",
  "investigate",
  "complete",
  "prepare",
  "escalate",
  "respond",
  "restart",
  "restore",
  "schedule",
  "confirm",
  "publish",
  "replace",
  "forward",
  "monitor",
  "approve",
  "review",
  "submit",
  "create",
  "remove",
  "assign",
  "verify",
  "install",
  "document",
  "cancel",
  "pause",
  "deploy",
  "update",
  "finish",
  "notify",
  "provide",
  "attach",
  "merge",
  "build",
  "check",
  "write",
  "share",
  "close",
  "open",
  "bring",
  "tell",
  "call",
  "test",
  "fix",
  "book",
  "send",
  "ship",
  "flag",
  "run",
  "get",
  "set",
  "add",
];

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TASK_VERB_SOURCE = [...TASK_VERBS]
  .sort((a, b) => b.length - a.length)
  .map((verb) => escapeRegex(verb).replace(/\s+/g, "\\s+"))
  .join("|");

const ACTION_LABEL_REGEX =
  /(?:^|:\s*)\b(?:action(?:\s+item)?|todo|to-do)\b\s*(?::|—|-|\s)/i;

const REQUEST_REGEX = new RegExp(
  String.raw`\b(?:please|can you|could you)\s+(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

const MODAL_DIRECTIVE_REGEX = new RegExp(
  String.raw`\b(?:need(?:s)? to|must|should|have to|has to)\s+(?!not\b)(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

const COMMITMENT_REGEX = new RegExp(
  String.raw`\b(?:I|we)\s+(?:can|will|shall|are going to|am going to)\s+(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

const IMPERATIVE_START_REGEX = new RegExp(
  String.raw`(?:^|[:.!?]\s+)(?:please\s+)?(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

const DECISION_TERMS = [
  "agreed on",
  "decided",
  "approved",
  "decision:",
];

const DATE_REGEX =
  /\b(?:today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|eoy|next week|next month|(?:by|before|at|around)\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2})\b/gi;

const HANDLE_SOURCE =
  String.raw`[\p{L}\p{N}_-](?:[\p{L}\p{N}._-]{0,38}[\p{L}\p{N}_-])?`;

const MENTION_REGEX = new RegExp(
  String.raw`(^|[\s([{"'])@(${HANDLE_SOURCE})`,
  "gu"
);

const SPECIAL_MENTIONS = new Set([
  "here",
  "channel",
  "everyone",
]);

function normalizeLine(line) {
  return String(line ?? "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .trim();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();

  return items.filter((item) => {
    const key = keyFn(item);

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function isNegatedAt(text, index) {
  const prefix = text.slice(
    Math.max(0, index - 48),
    index
  );

  return /\b(?:not|never|no|without|isn't|isn’t|aren't|aren’t|wasn't|wasn’t|weren't|weren’t|don't|don’t|doesn't|doesn’t|didn't|didn’t|can't|can’t|cannot|won't|won’t|will not|do not|does not|did not|is not|are not|was not|were not)\b(?:\W+\w+){0,2}\W*$/i.test(prefix);
}

function hasUnnegatedTerm(text, term) {
  const escaped = escapeRegex(term.trim()).replace(/\s+/g, "\\s+");
  const regex = new RegExp(`\\b${escaped}\\b`, "gi");

  let match;

  while ((match = regex.exec(text)) !== null) {
    if (!isNegatedAt(text, match.index)) return true;
  }

  return false;
}

export function urgencyFor(text) {
  const value = String(text ?? "");

  if (
    URGENCY_TERMS.High.some((term) =>
      hasUnnegatedTerm(value, term)
    )
  ) {
    return "High";
  }

  if (
    URGENCY_TERMS.Medium.some((term) =>
      hasUnnegatedTerm(value, term)
    ) ||
    /\b(?:by|before|at|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(value)
  ) {
    return "Medium";
  }

  return "Low";
}

export function extractMentions(text) {
  const matches = [];

  for (const line of String(text ?? "").split(/\r?\n/)) {
    const regex = new RegExp(MENTION_REGEX.source, "gu");
    let match;

    while ((match = regex.exec(line)) !== null) {
      const handle = match[2];

      if (
        handle &&
        !SPECIAL_MENTIONS.has(handle.toLowerCase())
      ) {
        matches.push({
          handle,
          line: normalizeLine(line),
        });
      }

      if (match[0].length === 0) {
        regex.lastIndex += 1;
      }
    }
  }

  return uniqueBy(
    matches,
    (item) =>
      `${item.handle.toLocaleLowerCase()}|${item.line.toLocaleLowerCase()}`
  );
}

export function extractDeadlines(text) {
  const items = [];

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = normalizeLine(rawLine);

    if (!line) continue;

    const matches = [
      ...line.matchAll(new RegExp(DATE_REGEX.source, "gi")),
    ].map((match) => match[0]);

    if (matches.length) {
      items.push({
        id: `deadline-${items.length}-${line.slice(0, 18)}`,
        text: line,
        dates: uniqueBy(
          matches.map((value) => value.trim()),
          (value) => value.toLowerCase()
        ),
        urgency: urgencyFor(line),
      });
    }
  }

  return uniqueBy(
    items,
    (item) => item.text.toLowerCase()
  );
}

function inferAssignee(line) {
  const explicit = line.match(
    new RegExp(
      String.raw`\b(?:assigned\s+to|assign\s+to|owner|assignee|task\s+for)\s*[:=]?\s*(@${HANDLE_SOURCE})`,
      "iu"
    )
  );

  if (explicit) return explicit[1];

  const directRequest = line.match(
    new RegExp(
      String.raw`(?:^|[\s([{"'])@(${HANDLE_SOURCE})\s+(?:(?:please|can you|could you|to)\s+)(?:${TASK_VERB_SOURCE})\b`,
      "iu"
    )
  );

  return directRequest ? `@${directRequest[1]}` : null;
}

function hasActionDirective(line) {
  // Keep decisions separate from tasks unless the line has a genuine
  // action directive in addition to decision language.
  const labelMatch = ACTION_LABEL_REGEX.exec(line);

  if (labelMatch) {
    const contentAfterLabel = line.slice(
      labelMatch.index + labelMatch[0].length
    );

    if (
      /^\s*(?:no\b|not\b|never\b|don't\b|don’t\b|do not\b|does