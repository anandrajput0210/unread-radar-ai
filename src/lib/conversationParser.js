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
  "eod",
  "eow",
  "eoy",
  "follow up",
];

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

const DECISION_TERMS = [
  "agreed on",
  "decided",
  "approved",
  "decision:",
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

const DATE_REGEX =
  /\b(?:today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|eoy|next week|next month|(?:by|before|at|around)\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2})\b/gi;

const ACTION_LABEL_REGEX =
  /(?:^|:\s*)\b(?:action(?:\s+item)?|todo|to-do)\b\s*(?::|—|–|-)\s*(.*)$/i;

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

const IMPERATIVE_REGEX = new RegExp(
  String.raw`(?:^|[:.!?]\s+)(?:please\s+)?(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

function normalizeLine(line) {
  return String(line ?? "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .trim();
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

export function extractMentions(text) {
  const matches = [];

  for (const line of String(text ?? "").split(/\r?\n/)) {
    const regex = new RegExp(
      MENTION_REGEX.source,
      "gu"
    );

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
      `${item.handle.toLowerCase()}|${item.line.toLowerCase()}`
  );
}

export function extractDeadlines(text) {
  const items = [];

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = normalizeLine(rawLine);

    if (!line) {
      continue;
    }

    const matches = [
      ...line.matchAll(
        new RegExp(DATE_REGEX.source, "giu")
      ),
    ].map((match) => match[0]);

    if (matches.length > 0) {
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
  const explicitOwner = line.match(
    new RegExp(
      String.raw`\b(?:assigned\s+to|assign\s+to|owner|assignee|task\s+for)\s*[:=]?\s*(@?${HANDLE_SOURCE})`,
      "iu"
    )
  );

  if (explicitOwner) {
    return explicitOwner[1];
  }

  const directRequest = line.match(
    new RegExp(
      String.raw`(?:^|[^\p{L}\p{N}._%+-])@(${HANDLE_SOURCE})(?:\s*:\s*|\s+)(?:(?:please|can you|could you|to)\s+)?(?:${TASK_VERB_SOURCE})\b`,
      "iu"
    )
  );

  return directRequest
    ? `@${directRequest[1]}`
    : null;
}

function hasActionDirective(line) {
  const labelMatch = ACTION_LABEL_REGEX.exec(line);

  if (labelMatch) {
    const content = labelMatch[1].trim();

    const isNegatedAction =
      /^(?:no\b|not\b|never\b|don't\b|don’t\b|do not\b|does not\b|is not\b|isn't\b|isn’t\b)/i.test(
        content
      );

    return content.length > 0 && !isNegatedAction;
  }

  const patterns = [
    REQUEST_REGEX,
    MODAL_DIRECTIVE_REGEX,
    COMMITMENT_REGEX,
    IMPERATIVE_REGEX,
  ];

  return patterns.some((pattern) =>
    hasUnnegatedPattern(line, pattern)
  );
}

function hasDecisionSignal(line) {
  return DECISION_TERMS.some((term) =>
    hasUnnegatedTerm(line, term)
  );
}

export function extractActions(text) {
  const actions = [];
  const decisions = [];

  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  lines.forEach((line, index) => {
    if (hasActionDirective(line)) {
      actions.push({
        id: `task-${index}-${line.slice(0, 16)}`,
        text: line,
        owner: inferAssignee(line),
        urgency: urgencyFor(line),
        completed: false,
      });
    }

    if (hasDecisionSignal(line)) {
      decisions.push(line);
    }
  });

  return {
    actions: uniqueBy(
      actions,
      (item) => item.text.toLowerCase()
    ),
    decisions: uniqueBy(
      decisions,
      (item) => item.toLowerCase()
    ),
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

export function analyzeConversations(rawText) {
  const text =
    typeof rawText === "string"
      ? rawText.trim()
      : "";

  if (!text) {
    return {
      actions: [],
      decisions: [],
      deadlines: [],
      mentions: [],
      summary: [],
      alerts: [],
      urgentRows: [],
      lineCount: 0,
    };
  }

  const sourceLines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const urgentRows = sourceLines.filter(
    (line) => urgencyFor(line) === "High"
  );

  const mentions = extractMentions(text);
  const deadlines = extractDeadlines(text);

  const { actions, decisions } = extractActions(text);

  const alerts = uniqueBy(
    [
      ...actions.map((item) => ({
        ...item,
        kind: "Action item",
      })),

      ...deadlines.map((item) => ({
        ...item,
        kind: "Deadline",
      })),

      ...mentions.map((item, index) => ({
        id: `mention-${index}`,
        text: `@${item.handle} mentioned: ${item.line}`,
        owner: item.handle,
        urgency: urgencyFor(item.line),
        kind: "Mention",
      })),
    ],
    (item) =>
      `${item.kind}|${item.text.toLowerCase()}`
  );

  return {
    actions,
    decisions,
    deadlines,
    mentions,
    summary: buildSummary(
      text,
      actions,
      deadlines,
      decisions,
      mentions
    ),
    alerts,
    urgentRows,
    lineCount: sourceLines.length,
  };
}