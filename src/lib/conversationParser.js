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
  /\b(?:today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening|noon|midnight))?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s?(?:am|pm))?|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/giu;

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

export function extractMentions(text) {
  const matches = [];

  for (const record of sourceLineRecords(text)) {
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
  return /\b(?:by|before|due(?:\s+by)?|no\s+later\s+than|deadline)\b[\s\S]{0,68}$/iu.test(prefix);
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



export function extractDeadlines(text) {
  const items = [];
  for (const record of sourceLineRecords(text)) {
    const line = record.text;
    if (!line || NON_ACTIONABLE_TIME_REFERENCE_REGEX.test(line)) continue;
    const { body } = parseChatRecord(line);
    if (/^\s*(?:got\s+it|understood|yes|sure|okay|ok|noted)[,!.\s]/iu.test(body) && [...body.matchAll(new RegExp(COMMITMENT_REGEX.source, "giu"))].length) continue;
    // Dates attached to an explicit decision are not automatically task deadlines.
    if (/^\s*(?:decision:|agreed\s+decision:)/iu.test(body)) continue;
    const matches = extractTimingSignals(body, { allowCommitmentTiming: true });
    if (!matches.length) continue;
    items.push({
      id: `deadline-${items.length}-${line.slice(0, 18)}`,
      text: line,
      dates: matches,
      urgency: urgencyFor(line),
      sourceSpan: sourceSpan(record),
    });
  }
  return uniqueBy(items, (item) => `${item.text.toLowerCase()}|${item.dates.join(",").toLowerCase()}`);
}

const RESERVED_SPEAKERS = new Set([
  "action", "action item", "todo", "to-do", "decision", "note", "system", "user", "assistant",
]);

const PERSON_NAME_SOURCE = String.raw`@?[\p{L}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}][\p{L}\p{M}'’.-]*){0,2}`;

function parseChatRecord(line) {
  const header = line.match(/^\s*(?:\[[^\]]+\]\s*)?(?<speaker>[^:\r\n]{1,64}):\s*(?<body>[\s\S]*)$/u);
  if (!header) return { speaker: null, body: line };
  const speaker = String(header.groups?.speaker || "").trim();
  if (!speaker || RESERVED_SPEAKERS.has(speaker.toLocaleLowerCase())) {
    return { speaker: null, body: line };
  }
  return { speaker, body: String(header.groups?.body || "").trim() };
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
    if (actionText) actions.push({ text: actionText, owner: groupAddress ? null : owner, classification: groupAddress ? "unassigned_action" : "assigned_task" });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return actions;
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
  return parts.length > 0 && parts.every((part) => action.includes(part)) ? "explicit" : body.includes("by ") || body.includes("before ") ? "contextual" : "explicit";
}

function taskClassificationFor(body, candidate) {
  if (candidate.classification) return candidate.classification;
  if (candidate.owner) return "assigned_task";
  if (/\b(?:can|could|would)\s+(?:you|someone|anyone|somebody)\b/iu.test(body)) return "unassigned_request";
  return "unassigned_action";
}

function matchesAcknowledgement(body) {
  return /^\s*(?:i['’]?m\s+on\s+it|on\s+it|will\s+do|i['’]?ll\s+(?:do\s+it|take\s+it)|got\s+it|consider\s+it\s+done|i\s+can\s+handle\s+that)[.!\s]*$/iu.test(body);
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
      const body = parseChatRecord(record.text).body;
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

export function extractActions(text) {
  const actions = [];
  const decisions = [];
  const decisionEvidence = [];
  const blockedPreconditions = [];
  const records = sourceLineRecords(text).filter((record) => record.text);

  for (const record of records) {
    const line = record.text;
    const { speaker, body } = parseChatRecord(line);

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

    let candidates = directAddressActions(body);

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
      const action = {
        id: `task-${record.ordinal}-${index}-${candidateText.slice(0, 16)}`,
        text: candidateText,
        sourceText: line,
        owner: candidate.owner || null,
        classification: taskClassificationFor(body, candidate),
        dueDate,
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
    const { speaker, body } = parseChatRecord(record.text);
    if (!speaker || !matchesAcknowledgement(body)) continue;
    const possibleMatches = actions.filter((action) =>
      action.sourceSpan.startOffset < record.startOffset && ownerMatchesSpeaker(action.owner, speaker)
    );
    if (possibleMatches.length !== 1) continue;
    const [action] = possibleMatches;
    action.acknowledgedBy = speaker;
    action.acknowledgementText = body;
    action.acknowledgementSpan = sourceSpan(record);
  }

  return {
    actions: uniqueBy(actions, (item) => `${item.text.toLowerCase()}|${(item.owner || "").toLowerCase()}`),
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

export function analyzeConversations(rawText) {
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

  const mentions = extractMentions(text);
  const deadlines = extractDeadlines(text);
  const { actions, decisions, decisionEvidence } = extractActions(text);

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
