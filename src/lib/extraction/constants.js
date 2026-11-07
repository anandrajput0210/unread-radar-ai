export const HIGH_URGENCY_TERMS = [
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

export const MEDIUM_URGENCY_TERMS = [
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

export const TASK_VERBS = [
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

export const DECISION_TERMS = [
  "agreed on",
  "agreed decision:",
  "decision:",
  "decided that",
  "decided to",
  "we decided",
];

export const SPECIAL_MENTIONS = new Set([
  "here",
  "channel",
  "everyone",
]);

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const TASK_VERB_SOURCE = [...TASK_VERBS]
  .sort((a, b) => b.length - a.length)
  .map((verb) => escapeRegex(verb).replace(/\s+/g, "\\s+"))
  .join("|");

/** Verbs accepted after an explicit request marker ("can you ...", "please ..."). Wider than TASK_VERBS, which also drives weaker imperative matching. */
export const EXTRA_REQUEST_VERBS = ["take", "handle", "join", "attend", "ping", "remind", "chase", "arrange", "renew", "sign", "pay", "transfer", "print", "order", "resend", "pick", "collect", "fix up", "push"];
export const REQUEST_VERB_SOURCE = [...TASK_VERBS, ...EXTRA_REQUEST_VERBS]
  .sort((a, b) => b.length - a.length)
  .map((verb) => escapeRegex(verb).replace(/\s+/g, "\\s+"))
  .join("|");

export const HANDLE_SOURCE = String.raw`[\p{L}\p{N}_-](?:[\p{L}\p{N}._-]{0,38}[\p{L}\p{N}_-])?`;

export const MENTION_REGEX = new RegExp(
  String.raw`(^|[^\p{L}\p{N}._%+-])@(${HANDLE_SOURCE})`,
  "gu"
);

export const TIMING_TOKEN_REGEX =
  /\b(?:day\s+after\s+tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|kal\s+(?:(?:subah|shaam|sham|raat|dopahar)\s+)?tak|parso\s+tak|eod|end\s+of\s+(?:the\s+)?day|cob|aaj|today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening|noon|midnight))?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s?(?:am|pm))?|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b|\b(?:\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})\b|(?<![\p{L}\p{M}])(?:सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार|कल|आज|परसों)(?:\s+(?:सुबह|दोपहर|शाम|रात))?\s+तक(?![\p{L}\p{M}])/giu;

export const ACTION_LABEL_REGEX =
  /(?:^|:\s*)\b(?:action(?:\s+item)?|todo|to-do)\b\s*(?::|—|–|-)\s*(.*)$/i;

export const REQUEST_REGEX = new RegExp(
  String.raw`\b(?:please|pl[sz]|can\s+(?:you|someone|anyone|somebody)|could\s+(?:you|someone|anyone|somebody)|would\s+you)\s+(?:also\s+)?(?:${REQUEST_VERB_SOURCE})\b`,
  "i"
);

export const MODAL_DIRECTIVE_REGEX = new RegExp(
  String.raw`\b(?:must|should|have to|has to)\s+(?!not\b)(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

const COMMITMENT_VERB_SOURCE = [...TASK_VERBS, ...EXTRA_REQUEST_VERBS.filter((verb) => !["take", "handle"].includes(verb))]
  .sort((a, b) => b.length - a.length)
  .map((verb) => escapeRegex(verb).replace(/\s+/g, "\\s+"))
  .join("|");

export const COMMITMENT_REGEX = new RegExp(
  String.raw`\b(?<pronoun>I|we)(?:['’]ll|\s+(?:can|will|shall|am going to|are going to))\s+(?<verb>${COMMITMENT_VERB_SOURCE})\b`,
  "giu"
);

export const IMPERATIVE_REGEX = new RegExp(
  String.raw`(?:^|[:.!?]\s+)(?:please\s+(?:also\s+)?)?(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

export const NON_ACTIONABLE_TIME_REFERENCE_REGEX =
  /\b(?:do\s+not|don't|does\s+not|doesn't|did\s+not|didn't)\s+need\s+to\b|\bno\s+need\s+to\b|\bnot\s+(?:necessary|required)\s+to\b|\b(?:do\s+not|don't)\s+have\s+to\b/i;

export const RESERVED_SPEAKERS = new Set([
  "action", "action item", "todo", "to-do", "decision", "note", "system", "user", "assistant",
  "no need", "no one", "anyone", "someone", "somebody",
]);

export const PERSON_NAME_SOURCE = String.raw`@?[\p{L}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}][\p{L}\p{M}'’.-]*){0,2}`;

export const NON_NAME_WORDS = new Set(["bhai", "bhaiya", "yaar", "bro", "sir", "madam", "didi", "ji", "ok", "okay", "hello", "hi", "hey", "team", "everyone", "please", "plz", "haan", "nahi", "abhi", "kal", "aaj", "client", "boss"]);

export const RELAY_ACTION_HINT = /\b(?:(?:le|lekar|le\s+kar)\s+(?:aaye|aaye\.|aaya\s+kare|aao|aana|aaiye)|le\s+aana|laye|laaye|laana|kare|karein|kar\s+(?:de|dena|do|le|lena|dein)|karna|karo|bheje|bhejo|bhej\s+(?:de|dena|do)|bhejna|de\s+(?:de|dena|do)|complete|send|share|submit|finish|update|call|check|prepare|finali[sz]e)\b/iu;

export const RELATION_STOP_WORDS = new Set([
  "the", "a", "an", "to", "in", "on", "at", "by", "before", "after", "for", "with", "from", "and", "or", "but", "that", "this", "it", "we", "i", "ill", "i'll", "can", "will", "shall", "please", "you", "my", "your", "our", "their", "his", "her", "me", "us", "them", "as", "is", "are", "was", "were", "be", "been", "being", "of", "into", "over", "under", "up", "down", "once", "when", "if", "until", "unless", "after", "got", "sure", "yes", "okay", "ok", "understood", "thanks", "thank", "i", "ll", "by", "pm", "am", "today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "morning", "afternoon", "evening", "noon", "update", "task", "item", "client", "customer",
]);

export const TASK_VERB_SET = new Set(TASK_VERBS.flatMap((verb) => verb.toLowerCase().split(/\s+/)));

export const PRONOUN_OBJECTS = new Set(["it", "this", "that", "them", "these", "those", "isse", "ise", "usse", "use", "yeh", "ye", "woh", "wo"]);

export const DEADLINE_WORDS = new Set(["tomorrow", "today", "tonight", "kal", "parso", "aaj", "tak", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "morning", "evening", "eod", "week", "weekend", "next", "later"]);

export const DELAY_CUE = /\b(?:nahi\s+(?:bheji|bheja|bheje|aaya|aayi|aaye|mila|mili|mile|diya|di)|abhi\s+tak\s+nahi|pending\s+hai|late\s+ho|missing|pending|waiting\s+(?:for|on)|not\s+(?:ready|received)|blocked|delay(?:ed)?|running\s+late|haven['’]?t\s+(?:received|got))\b/iu;
