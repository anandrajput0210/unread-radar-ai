/**
 * Shared chat-export parser.
 *
 * This is the single place that decides where one source message ends and the
 * next begins. It never modifies source text: every record is described by
 * half-open UTF-16 offsets into the original string. Where the format cannot
 * be recognised reliably the result says so through `warnings` instead of
 * silently guessing.
 *
 * Dialects
 *   "whatsapp-timestamped"  Android (`12/05/2025, 9:15 am - Name: text`),
 *                           iOS (`[12/05/25, 9:15:32 AM] Name: text`), ISO.
 *                           Only header lines start a message; every other
 *                           line is a continuation of the previous message.
 *   "speaker-labelled"      Untimestamped `Name: text`. A colon is ambiguous
 *                           in prose, so this dialect is accepted only when
 *                           EVERY non-empty line is a header.
 *   "opaque"                Nothing reliable. One record, unknown author/time,
 *                           plus an explicit warning.
 */

const INVISIBLE = "\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff";
const DATE = String.raw`\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}`;
const MERIDIEM = String.raw`(?:[ap]\.?\s?m\.?)`;
const TIME = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:\s?${MERIDIEM})?`;

const BRACKETED = new RegExp(
  String.raw`^[${INVISIBLE}\s]*\[(?<ts>(?:${DATE}),?\s*(?:${TIME})|(?:${TIME}),?\s*(?:${DATE}))\][${INVISIBLE}\s]*(?<rest>.*)$`,
  "iu",
);
const ANDROID = new RegExp(
  String.raw`^[${INVISIBLE}]*(?<ts>(?:${DATE}),?\s+(?:${TIME}))\s+[-–—]\s+(?<rest>.*)$`,
  "iu",
);
const HEADER_LIKE = new RegExp(String.raw`^[${INVISIBLE}\s]*\[?\s*\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}`, "u");
const AUTHOR_SPLIT = /^(?<author>[^:\r\n]{1,64}?):(?:\s(?<body>[\s\S]*)|\s*$)/u;
const BARE_HEADER = /^\s*(?<author>@?[\p{L}\p{N}][\p{L}\p{N} ._'’-]{0,39}):[\t ]+/u;

const RESERVED_LABELS = new Set([
  "action", "action item", "todo", "to-do", "decision", "note",
  "system", "user", "assistant", "from", "subject",
]);
const SYSTEM_VERBS = /\b(added|removed|left|joined|changed|created|deleted|pinned|unpinned|was added|were added|security code|end-to-end|encrypted|turned (?:on|off)|missed (?:voice|video) call|started a call)\b/iu;
const MEDIA_BODY = /^[<\[]?\s*(?:(?:media|image|video|audio|sticker|gif|document|contact card|voice message|ptt)\s+omitted|attached:\s*[^>\]]+|[^<>\n]+\.\w{2,5}\s*\(file attached\))\s*[>\]]?$/iu;
const DELETED_BODY = /^(?:you deleted this message|this message was deleted|message deleted)\.?$/iu;
const FORWARDED = /^\s*(?:↪\s*)?forwarded(?:\s+many\s+times)?\b/iu;
const EDITED_SUFFIX = /\s*<this message was edited>\s*$/iu;

/** Same-length normalisation so match offsets stay valid against the original. */
function forMatching(line) {
  return line.replace(/[\u202f\u00a0\u2009\u2007]/gu, " ");
}

export function physicalLines(text) {
  const lines = [];
  let startOffset = 0;
  // \r\n, \n and a lone \r (old Mac exports, stray trailing CR) all end a line.
  const parts = text.split(/\r\n|\n|\r/u);
  for (let index = 0; index < parts.length; index += 1) {
    const rawText = parts[index];
    const endOffset = startOffset + rawText.length;
    lines.push({ rawText, startOffset, endOffset, ordinal: index });
    if (index < parts.length - 1) {
      startOffset = endOffset + (text.startsWith("\r\n", endOffset) ? 2 : 1);
    }
  }
  return lines;
}

function parseClock(value) {
  const match = /(\d{1,2}):(\d{2})(?::\d{2})?\s?(?:([ap])\.?\s?m\.?)?/iu.exec(value);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "a" && hour === 12) hour = 0;
    if (meridiem === "p" && hour !== 12) hour += 12;
  } else if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function splitDate(value) {
  const match = new RegExp(`(${DATE})`, "u").exec(value);
  if (!match) return null;
  const parts = match[1].split(/[/.\-]/u).map(Number);
  const isoFirst = /^\d{4}[/.\-]/u.test(match[1]);
  return isoFirst
    ? { order: "ymd", year: parts[0], a: parts[1], b: parts[2] }
    : { order: "pending", a: parts[0], b: parts[1], year: parts[2] };
}

function buildDate({ year, month, day }) {
  const fullYear = year < 100 ? (year >= 70 ? 1900 + year : 2000 + year) : year;
  const check = new Date(Date.UTC(fullYear, month - 1, day));
  if (check.getUTCFullYear() !== fullYear || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(fullYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Decide DMY vs MDY from evidence in the file itself. Never guesses silently. */
function detectDateOrder(rawDates, requested) {
  if (requested === "dmy" || requested === "mdy") {
    return { order: requested, basis: "user-selected", ambiguous: false };
  }
  let dmyEvidence = 0;
  let mdyEvidence = 0;
  let sawNumeric = false;
  for (const d of rawDates) {
    if (!d || d.order !== "pending") continue;
    sawNumeric = true;
    if (d.a > 12 && d.b <= 12) dmyEvidence += 1;
    if (d.b > 12 && d.a <= 12) mdyEvidence += 1;
  }
  if (dmyEvidence && mdyEvidence) return { order: "dmy", basis: "conflicting", ambiguous: true };
  if (dmyEvidence) return { order: "dmy", basis: "inferred-from-data", ambiguous: false };
  if (mdyEvidence) return { order: "mdy", basis: "inferred-from-data", ambiguous: false };
  return { order: "dmy", basis: sawNumeric ? "assumed-default" : "iso-or-none", ambiguous: sawNumeric };
}

function resolveTimestamp(rawDate, rawTs, order, conflicting = false) {
  if (!rawDate) return null;
  let effective = order;
  if (conflicting && rawDate.order === "pending") {
    // The file mixes DD/MM and MM/DD evidence. Trust only dates that are
    // unambiguous on their own; leave the rest unresolved rather than guess.
    if (rawDate.a > 12 && rawDate.b <= 12) effective = "dmy";
    else if (rawDate.b > 12 && rawDate.a <= 12) effective = "mdy";
    else return { date: null, time: parseClock(rawTs), raw: rawTs, unresolvedReason: "date-order-conflict" };
  }
  let year; let month; let day;
  if (rawDate.order === "ymd") ({ year, a: month, b: day } = rawDate);
  else if (effective === "mdy") ({ year, a: month, b: day } = rawDate);
  else ({ year, a: day, b: month } = rawDate);
  const date = buildDate({ year, month, day });
  if (!date) return null;
  return { date, time: parseClock(rawTs), raw: rawTs };
}

const INVISIBLE_RUN = new RegExp(`[${INVISIBLE}]`, "gu");

/** Parsed-field normalisation only: source text and offsets are untouched. */
export function cleanAuthor(value) {
  return String(value ?? "").replace(INVISIBLE_RUN, "").replace(/[\u202f\u00a0\s]+/gu, " ").trim();
}

function classifyHeaderRest(rest) {
  const split = AUTHOR_SPLIT.exec(rest);
  if (!split) return { kind: "system", author: null, bodyOffsetInRest: 0, body: rest };
  const author = cleanAuthor(split.groups.author);
  const words = author.split(/\s+/u).filter(Boolean).length;
  if (!author || RESERVED_LABELS.has(author.toLocaleLowerCase()) || words > 6 || (words >= 3 && SYSTEM_VERBS.test(author))) {
    return { kind: "system", author: null, bodyOffsetInRest: 0, body: rest };
  }
  const colon = rest.indexOf(":", split.groups.author.length - 1);
  const afterColon = colon + 1;
  const body = rest.slice(afterColon).replace(/^\s/u, "");
  const bodyOffsetInRest = rest.length - body.length;
  return { kind: "message", author, bodyOffsetInRest, body };
}

function classifyBody(kind, body) {
  if (kind === "system") return { kind, forwarded: false, edited: false };
  const visible = body.replace(new RegExp(`[${INVISIBLE}]`, "gu"), "").trim();
  const edited = EDITED_SUFFIX.test(visible);
  const core = visible.replace(EDITED_SUFFIX, "").trim();
  if (MEDIA_BODY.test(core)) return { kind: "media", forwarded: false, edited };
  if (DELETED_BODY.test(core)) return { kind: "deleted", forwarded: false, edited };
  return { kind: "message", forwarded: FORWARDED.test(core), edited };
}

function matchTimestampedHeader(rawLine) {
  const line = forMatching(rawLine);
  const hit = BRACKETED.exec(line) || ANDROID.exec(line);
  if (!hit) return null;
  const ts = hit.groups.ts.trim();
  const rawDate = splitDate(ts);
  if (!rawDate) return null;
  const rest = rawLine.slice(rawLine.length - hit.groups.rest.length);
  return { ts, rawDate, rest, restOffset: rawLine.length - hit.groups.rest.length };
}

function trimTrailingBlankLines(lines, from, to) {
  let last = to;
  while (last > from && lines[last].rawText.trim() === "") last -= 1;
  return last;
}

function warning(code, severity, message, extra = {}) {
  return { code, severity, message, ...extra };
}

export function parseChatExport(text, options = {}) {
  const raw = typeof text === "string" ? text : "";
  const lines = physicalLines(raw);
  const nonEmpty = lines.filter((l) => l.rawText.trim().length > 0);
  const warnings = [];

  if (!nonEmpty.length) {
    return { dialect: "empty", dateOrder: { order: "dmy", basis: "none", ambiguous: false }, messages: [], warnings, stats: { messages: 0 } };
  }

  const stamped = new Map();
  for (const line of lines) {
    const header = matchTimestampedHeader(line.rawText);
    if (header) stamped.set(line.ordinal, header);
  }
  const firstNonEmpty = nonEmpty[0].ordinal;
  const isTimestamped = stamped.size >= 2 || (stamped.size === 1 && stamped.has(firstNonEmpty));

  if (isTimestamped) {
    const dateOrder = detectDateOrder([...stamped.values()].map((h) => h.rawDate), options.dateOrder);
    if (dateOrder.basis === "conflicting") {
      warnings.push(warning("DATE_ORDER_CONFLICT", "error",
        "Dates in this export contain both DD/MM and MM/DD evidence. Only dates that are unambiguous on their own are resolved; deadlines relative to any other message are left unresolved until you choose a date order."));
    } else if (dateOrder.ambiguous) {
      warnings.push(warning("DATE_ORDER_AMBIGUOUS", "warning",
        `Every date in this export could be read as DD/MM or MM/DD. Assuming ${dateOrder.order === "dmy" ? "DD/MM" : "MM/DD"}; relative deadlines depend on this. Change it if due dates look wrong.`));
    }

    const starts = [...stamped.keys()].sort((a, b) => a - b);
    const messages = [];
    const addRecord = (fromLine, toLine, extra) => {
      const lastContent = trimTrailingBlankLines(lines, fromLine, toLine);
      messages.push({
        ordinal: messages.length,
        startOffset: lines[fromLine].startOffset,
        endOffset: lines[lastContent].endOffset,
        boundaryType: extra.boundaryType,
        authorRaw: extra.authorRaw,
        timestampRaw: extra.timestampRaw,
        timestamp: extra.timestamp,
        bodyStartOffset: extra.bodyStartOffset,
        kind: extra.kind,
        forwarded: extra.forwarded,
        edited: extra.edited,
        lineCount: lastContent - fromLine + 1,
      });
    };

    if (starts[0] > 0) {
      const leadingNonEmpty = nonEmpty.filter((l) => l.ordinal < starts[0]);
      if (leadingNonEmpty.length) {
        warnings.push(warning("LEADING_UNRECOGNIZED_TEXT", "warning",
          `${leadingNonEmpty.length} line${leadingNonEmpty.length === 1 ? "" : "s"} before the first recognised message header were kept as an unattributed preamble and are not treated as anyone's commitment.`,
          { lines: leadingNonEmpty.slice(0, 5).map((l) => l.ordinal + 1) }));
        addRecord(0, starts[0] - 1, {
          boundaryType: "preamble", authorRaw: null, timestampRaw: null, timestamp: null,
          bodyStartOffset: lines[0].startOffset, kind: "preamble", forwarded: false, edited: false,
        });
      }
    }

    for (let i = 0; i < starts.length; i += 1) {
      const startLine = starts[i];
      const endLine = (i + 1 < starts.length ? starts[i + 1] : lines.length) - 1;
      const header = stamped.get(startLine);
      const cls = classifyHeaderRest(header.rest);
      const bodyStartOffset = lines[startLine].startOffset + header.restOffset + cls.bodyOffsetInRest;
      const lastLine = trimTrailingBlankLines(lines, startLine, endLine);
      const fullBody = raw.slice(bodyStartOffset, lines[lastLine].endOffset);
      const flags = classifyBody(cls.kind, fullBody);
      addRecord(startLine, endLine, {
        boundaryType: "recognized-header",
        authorRaw: cls.author,
        timestampRaw: header.ts,
        timestamp: resolveTimestamp(header.rawDate, header.ts, dateOrder.order, dateOrder.basis === "conflicting"),
        bodyStartOffset,
        kind: flags.kind,
        forwarded: flags.forwarded,
        edited: flags.edited,
      });
    }

    const unparsedHeaderLike = lines.filter((l) =>
      l.rawText.trim() && !stamped.has(l.ordinal) && HEADER_LIKE.test(forMatching(l.rawText)));
    if (unparsedHeaderLike.length) {
      const ratio = unparsedHeaderLike.length / starts.length;
      warnings.push(warning("UNPARSED_HEADER_LIKE_LINES", ratio > 0.2 ? "error" : "warning",
        `${unparsedHeaderLike.length} line${unparsedHeaderLike.length === 1 ? "" : "s"} start with a date but did not match a supported header format, so ${unparsedHeaderLike.length === 1 ? "it was" : "they were"} attached to the previous message. If this export uses a different date or AM/PM style, those messages may be merged.`,
        { lines: unparsedHeaderLike.slice(0, 10).map((l) => l.ordinal + 1) }));
    }

    const unresolved = messages.filter((m) => m.boundaryType === "recognized-header" && !m.timestamp).length;
    if (unresolved) {
      warnings.push(warning("INVALID_TIMESTAMPS", "warning",
        `${unresolved} message${unresolved === 1 ? "" : "s"} have a header whose date or time is not a valid calendar value; relative deadlines for them cannot be resolved.`));
    }

    return {
      dialect: "whatsapp-timestamped",
      dateOrder,
      messages,
      warnings,
      stats: {
        messages: messages.length,
        authored: messages.filter((m) => m.kind === "message").length,
        system: messages.filter((m) => m.kind === "system").length,
        media: messages.filter((m) => m.kind === "media").length,
        deleted: messages.filter((m) => m.kind === "deleted").length,
      },
    };
  }

  // Untimestamped "Name: text": accept only if every non-empty line is a header.
  const bare = new Map();
  for (const line of nonEmpty) {
    const hit = BARE_HEADER.exec(line.rawText);
    if (!hit) continue;
    const author = hit.groups.author.trim();
    if (!author || RESERVED_LABELS.has(author.toLocaleLowerCase())) continue;
    bare.set(line.ordinal, { author, bodyOffset: hit[0].length });
  }
  if (bare.size === nonEmpty.length) {
    const messages = nonEmpty.map((line, index) => {
      const nextStart = index + 1 < nonEmpty.length ? nonEmpty[index + 1].startOffset : raw.length;
      let endOffset = nextStart;
      if (raw.slice(Math.max(0, endOffset - 2), endOffset) === "\r\n") endOffset -= 2;
      else if (raw.slice(Math.max(0, endOffset - 1), endOffset) === "\n") endOffset -= 1;
      const header = bare.get(line.ordinal);
      const flags = classifyBody("message", raw.slice(line.startOffset + header.bodyOffset, endOffset));
      return {
        ordinal: index,
        startOffset: index === 0 ? 0 : line.startOffset,
        endOffset,
        boundaryType: "recognized-header",
        authorRaw: header.author,
        timestampRaw: null,
        timestamp: null,
        bodyStartOffset: line.startOffset + header.bodyOffset,
        kind: flags.kind,
        forwarded: flags.forwarded,
        edited: flags.edited,
        lineCount: 1,
      };
    });
    warnings.push(warning("NO_TIMESTAMPS", "warning",
      "This text has speaker names but no timestamps. Relative deadlines such as “tomorrow” cannot be resolved to calendar dates."));
    return {
      dialect: "speaker-labelled",
      dateOrder: { order: options.dateOrder === "mdy" ? "mdy" : "dmy", basis: "none", ambiguous: false },
      messages,
      warnings,
      stats: { messages: messages.length, authored: messages.length, system: 0, media: 0, deleted: 0 },
    };
  }

  warnings.push(warning("UNRECOGNIZED_FORMAT", "error",
    "Message boundaries were not recognised, so this import is treated as ONE message with unknown sender and time. Task owners and dates cannot be attributed reliably. Check that this is a WhatsApp “Export chat” text file, or paste it with one “Name: message” per line.",
    { unrecognizedLines: nonEmpty.filter((l) => !bare.has(l.ordinal)).slice(0, 5).map((l) => l.ordinal + 1) }));
  return {
    dialect: "opaque",
    dateOrder: { order: "dmy", basis: "none", ambiguous: false },
    messages: [{
      ordinal: 0, startOffset: 0, endOffset: raw.length, boundaryType: "opaque",
      authorRaw: null, timestampRaw: null, timestamp: null, bodyStartOffset: 0,
      kind: "opaque", forwarded: false, edited: false, lineCount: lines.length,
    }],
    warnings,
    stats: { messages: 1, authored: 0, system: 0, media: 0, deleted: 0 },
  };
}
