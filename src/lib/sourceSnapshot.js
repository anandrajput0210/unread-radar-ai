import { parseChatExport, physicalLines } from "./chatExportParser.js";

const SOURCE_IDENTITY_VERSION = 1;
const SOURCE_FORMAT = "plain-text";
const HASH_ALGORITHM = "SHA-256";
const HASH_ENCODING = "UTF-8";
const OFFSET_UNIT = "UTF-16 code units";

async function sha256(value) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    throw new Error("Web Crypto is required to create stable source identities in this browser.");
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest(HASH_ALGORITHM, bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const parsed = parseChatExport(rawText, { dateOrder: options.dateOrder });

  // An explicit user date-order choice changes how timestamps are interpreted,
  // so it is part of the identity (and of cache keys). Automatic detection is
  // deterministic from the text and leaves existing identities unchanged.
  const explicitOrder = options.dateOrder === "dmy" || options.dateOrder === "mdy" ? options.dateOrder : null;
  const snapshotDigest = await sha256(JSON.stringify(explicitOrder ? [
    SOURCE_IDENTITY_VERSION,
    sourceFormat,
    rawText,
    explicitOrder,
  ] : [
    SOURCE_IDENTITY_VERSION,
    sourceFormat,
    rawText,
  ]));
  const snapshotId = `sha256:${snapshotDigest}`;
  const messages = [];

  for (const range of parsed.messages) {
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
      // Additive fields from the shared parser. Source text is never altered;
      // these only describe it.
      timestamp: range.timestamp,
      bodyStartOffset: range.bodyStartOffset,
      kind: range.kind,
      forwarded: range.forwarded,
      edited: range.edited,
    });
  }

  const boundaryMode = parsed.dialect === "opaque" || parsed.dialect === "empty" ? "opaque" : "recognized";

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
    dialect: parsed.dialect,
    dateOrder: parsed.dateOrder,
    importWarnings: parsed.warnings,
    parseStats: parsed.stats,
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
