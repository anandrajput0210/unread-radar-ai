const SOURCE_IDENTITY_VERSION = 1;
const SOURCE_FORMAT = "plain-text";
const HASH_ALGORITHM = "SHA-256";
const HASH_ENCODING = "UTF-8";
const OFFSET_UNIT = "UTF-16 code units";

const RESERVED_HEADER_LABELS = new Set([
  "action",
  "action item",
  "todo",
  "to-do",
  "decision",
  "note",
  "system",
  "user",
  "assistant",
  "from",
  "subject",
]);

const HEADER_PATTERNS = [
  /^\s*\[(?<timestamp>[^\]]{4,48})\]\s*(?<author>[^:\r\n]{1,64}):[\t ]*/u,
  /^\s*(?<timestamp>\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(?<author>[^:\r\n]{1,64}):[\t ]*/u,
  /^\s*(?<timestamp>\d{1,2}[/-]\d{1,2}[/-]\d{2,4},?\s+\d{1,2}:\d{2}(?:\s?[AP]M)?)\s*[-–—]\s*(?<author>[^:\r\n]{1,64}):[\t ]*/iu,
  /^\s*(?<author>@?[\p{L}\p{N}][\p{L}\p{N} ._'’-]{0,39}):[\t ]+/u,
];

function parseHeader(line) {
  for (const pattern of HEADER_PATTERNS) {
    const match = pattern.exec(line);
    if (!match) continue;
    const author = String(match.groups?.author ?? "").trim();
    if (!author || RESERVED_HEADER_LABELS.has(author.toLocaleLowerCase())) return null;
    return {
      authorRaw: author,
      timestampRaw: match.groups?.timestamp?.trim() || null,
    };
  }
  return null;
}

function physicalLines(text) {
  const lines = [];
  let startOffset = 0;
  const parts = text.split(/\r?\n/u);
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

async function sha256(value) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    throw new Error("Web Crypto is required to create stable source identities in this browser.");
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest(HASH_ALGORITHM, bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildMessageRanges(text, lines, headers) {
  const nonEmpty = lines.filter((line) => line.rawText.trim().length > 0);
  const fullyRecognized = nonEmpty.length > 0 && nonEmpty.every((line) => headers.has(line.ordinal));

  if (!fullyRecognized) {
    return text.length
      ? [{
          ordinal: 0,
          startOffset: 0,
          endOffset: text.length,
          authorRaw: null,
          timestampRaw: null,
          boundaryType: "opaque",
        }]
      : [];
  }

  const starts = nonEmpty.map((line) => ({
    startOffset: line.startOffset,
    header: headers.get(line.ordinal),
  }));

  return starts.map((entry, index) => {
    const nextStart = index + 1 < starts.length ? starts[index + 1].startOffset : text.length;
    // Exclude one record-separator newline from message content so identical
    // repeated records have identical rawText even at different positions.
    let endOffset = nextStart;
    if (text.slice(Math.max(0, endOffset - 2), endOffset) === "\r\n") endOffset -= 2;
    else if (text.slice(Math.max(0, endOffset - 1), endOffset) === "\n") endOffset -= 1;
    return {
      ordinal: index,
      startOffset: index === 0 ? 0 : entry.startOffset,
      endOffset,
      authorRaw: entry.header.authorRaw,
      timestampRaw: entry.header.timestampRaw,
      boundaryType: "recognized-header",
    };
  });
}

/**
 * Creates an immutable-in-practice, snapshot-local source record.
 * Hashes are SHA-256 over UTF-8 bytes. Offsets are JavaScript UTF-16
 * code-unit offsets and use half-open [startOffset, endOffset) ranges.
 */
export async function createSourceSnapshot(rawText, options = {}) {
  if (typeof rawText !== "string") {
    throw new TypeError("Source text must be a string.");
  }

  const sourceFormat = typeof options.sourceFormat === "string" && options.sourceFormat.trim()
    ? options.sourceFormat.trim()
    : SOURCE_FORMAT;
  const lines = physicalLines(rawText);
  const headers = new Map();
  for (const line of lines) {
    const header = parseHeader(line.rawText);
    if (header) headers.set(line.ordinal, header);
  }

  const snapshotDigest = await sha256(JSON.stringify([
    SOURCE_IDENTITY_VERSION,
    sourceFormat,
    rawText,
  ]));
  const snapshotId = `sha256:${snapshotDigest}`;
  const ranges = buildMessageRanges(rawText, lines, headers);
  const messages = [];

  for (const range of ranges) {
    const content = rawText.slice(range.startOffset, range.endOffset);
    const messageDigest = await sha256(JSON.stringify([
      SOURCE_IDENTITY_VERSION,
      snapshotId,
      range.ordinal,
      range.startOffset,
      range.endOffset,
      content,
    ]));
    messages.push({
      messageId: `sha256:${messageDigest}`,
      snapshotId,
      ordinal: range.ordinal,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      rawText: content,
      authorRaw: range.authorRaw,
      timestampRaw: range.timestampRaw,
      boundaryType: range.boundaryType,
    });
  }

  const boundaryMode = ranges.length === 0
    ? "opaque"
    : ranges.length === 1 && ranges[0].boundaryType === "opaque"
      ? "opaque"
      : "recognized";

  return {
    schemaVersion: SOURCE_IDENTITY_VERSION,
    normalizerVersion: SOURCE_IDENTITY_VERSION,
    snapshotId,
    sourceFormat,
    rawText,
    boundaryMode,
    messageGranularity: boundaryMode === "opaque" ? "single-source-message" : "recognized-records",
    identity: {
      algorithm: HASH_ALGORITHM,
      encoding: HASH_ENCODING,
      offsetUnit: OFFSET_UNIT,
      transformations: "None; original decoded string is preserved exactly",
    },
    messages,
  };
}

export function getSourceLineSpans(rawText) {
  if (typeof rawText !== "string") return [];
  return physicalLines(rawText).map(({ startOffset, endOffset, rawText: line }) => ({
    startOffset,
    endOffset,
    rawText: line,
  }));
}

export const SOURCE_IDENTITY_METADATA = Object.freeze({
  schemaVersion: SOURCE_IDENTITY_VERSION,
  algorithm: HASH_ALGORITHM,
  encoding: HASH_ENCODING,
  offsetUnit: OFFSET_UNIT,
});
