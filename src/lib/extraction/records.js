import { parseChatExport } from "../import/chatExportParser.js";
import { RESERVED_SPEAKERS } from "./constants.js";
import { parseWhatsAppTimestamp } from "./dates.js";
import { normalizeLine, sourceLineRecords } from "./text.js";

export function parseChatRecord(line, options = {}) {
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
export function resolveParseOptions(text, options = {}) {
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

export function recordMeta(record, options = {}) {
  return record.meta ?? parseChatRecord(record.text, options);
}

export function sharedMessageRecords(text, parsed) {
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

export function conversationMessageRecords(text, options = {}) {
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
