const STORAGE_PREFIX = "unread-radar-ai:local-session:v1:";
export const SCHEMA_VERSION = 1;
export const MAX_SAVED_SESSIONS = 5;
export const MAX_RECORD_BYTES = 512 * 1024;

const UINT64_MASK = (1n << 64n) - 1n;
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

function normalizedText(text) {
  if (typeof text !== "string") {
    throw new TypeError("Text to fingerprint must be a string.");
  }
  return text.replace(/\r\n?/gu, "\n").normalize("NFC");
}

export function fingerprint(text) {
  const bytes = new TextEncoder().encode(normalizedText(text));
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & UINT64_MASK;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function sessionKey(value) {
  return `${STORAGE_PREFIX}${value}`;
}

function isRecordObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isValidRecord(value) {
  return isRecordObject(value)
    && value.schemaVersion === SCHEMA_VERSION
    && typeof value.fingerprint === "string"
    && typeof value.savedAt === "string"
    && Number.isFinite(Date.parse(value.savedAt))
    && isRecordObject(value.analysis)
    && isRecordObject(value.reviewDecisions)
    && isRecordObject(value.taskStatuses)
    && (value.selectedIdentity === null || typeof value.selectedIdentity === "string")
    && Array.isArray(value.sourceMessageFingerprints)
    && value.sourceMessageFingerprints.every((item) => typeof item === "string")
    && (value.sourceSnapshotId === null || typeof value.sourceSnapshotId === "string")
    && Array.isArray(value.sourceMessageRanges)
    && value.sourceMessageRanges.every((range) => isRecordObject(range)
      && Number.isSafeInteger(range.startOffset)
      && Number.isSafeInteger(range.endOffset));
}

function getOwnedKeys(storage) {
  let length;
  try {
    length = storage.length;
  } catch (error) {
    return { keys: [], error };
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    return { keys: [], error: new Error("Storage returned an invalid key count.") };
  }

  const keys = [];
  for (let index = 0; index < length; index += 1) {
    let key;
    try {
      key = storage.key(index);
    } catch (error) {
      return { keys: [], error };
    }
    if (typeof key === "string" && key.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  return { keys, error: null };
}

function readStoredRecords(storage) {
  const { keys, error: keyError } = getOwnedKeys(storage);
  if (keyError) return { records: [], error: keyError };

  const records = [];
  for (const key of keys) {
    let serialized;
    try {
      serialized = storage.getItem(key);
    } catch (error) {
      return { records: [], error };
    }
    if (typeof serialized !== "string") continue;

    let value;
    try {
      value = JSON.parse(serialized);
    } catch {
      continue;
    }
    if (isValidRecord(value) && key === sessionKey(value.fingerprint)) {
      records.push(value);
    }
  }
  records.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
  return { records, error: null };
}

function notSaved(reason, message) {
  return { saved: false, status: "not-saved", reason, message };
}

function storageFailureMessage() {
  return "This analysis was not saved because device storage is unavailable or full.";
}

function recordBytes(serialized) {
  return new TextEncoder().encode(serialized).byteLength;
}

function prepareRecord(record) {
  if (!isRecordObject(record)
    || typeof record.fingerprint !== "string"
    || !record.fingerprint
    || record.schemaVersion !== SCHEMA_VERSION
    || !isRecordObject(record.analysis)) {
    return null;
  }
  return {
    fingerprint: record.fingerprint,
    savedAt: typeof record.savedAt === "string" && Number.isFinite(Date.parse(record.savedAt))
      ? record.savedAt
      : new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    analysis: record.analysis,
    reviewDecisions: isRecordObject(record.reviewDecisions) ? record.reviewDecisions : {},
    taskStatuses: isRecordObject(record.taskStatuses) ? record.taskStatuses : {},
    selectedIdentity: typeof record.selectedIdentity === "string" ? record.selectedIdentity : null,
    sourceMessageFingerprints: Array.isArray(record.sourceMessageFingerprints)
      ? record.sourceMessageFingerprints.filter((item) => typeof item === "string")
      : [],
    sourceSnapshotId: typeof record.sourceSnapshotId === "string" ? record.sourceSnapshotId : null,
    sourceMessageRanges: Array.isArray(record.sourceMessageRanges)
      ? record.sourceMessageRanges.filter((range) => isRecordObject(range)
        && Number.isSafeInteger(range.startOffset)
        && Number.isSafeInteger(range.endOffset))
        .map(({ startOffset, endOffset }) => ({ startOffset, endOffset }))
      : [],
  };
}

export function saveSession(storage, record) {
  const safeRecord = prepareRecord(record);
  if (!safeRecord) return notSaved("invalid-record", "This analysis was not saved because its record is invalid.");

  let serialized;
  let size;
  try {
    serialized = JSON.stringify(safeRecord);
    size = recordBytes(serialized);
  } catch {
    return notSaved("invalid-record", "This analysis was not saved because its record could not be encoded.");
  }
  if (size > MAX_RECORD_BYTES) {
    return notSaved("too-large", "This analysis was not saved because it exceeds the per-record size limit.");
  }

  const { records, error: readError } = readStoredRecords(storage);
  if (readError) return notSaved("storage-unavailable", storageFailureMessage());

  try {
    storage.setItem(sessionKey(safeRecord.fingerprint), serialized);
  } catch (error) {
    const quotaFailure = error?.name === "QuotaExceededError" || error?.code === 22;
    return notSaved(quotaFailure ? "quota" : "storage-unavailable", storageFailureMessage());
  }

  const uniqueRecords = records.filter((item) => item.fingerprint !== safeRecord.fingerprint);
  uniqueRecords.push(safeRecord);
  uniqueRecords.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
  for (const oldRecord of uniqueRecords.slice(MAX_SAVED_SESSIONS)) {
    try {
      storage.removeItem(sessionKey(oldRecord.fingerprint));
    } catch {
      return {
        saved: true,
        status: "saved",
        message: "Analysis saved, but an older saved session could not be removed.",
      };
    }
  }
  return { saved: true, status: "saved", message: "Analysis saved on this device." };
}

export function persistIfEnabled(storage, enabled, record, save = saveSession) {
  if (!enabled) {
    return { saved: false, status: "disabled", message: "Persistence is off; nothing was saved." };
  }
  return save(storage, record);
}

export function loadSession(storage, fingerprintValue) {
  if (typeof fingerprintValue !== "string" || !fingerprintValue) return null;
  let serialized;
  try {
    serialized = storage.getItem(sessionKey(fingerprintValue));
  } catch {
    return null;
  }
  if (typeof serialized !== "string") return null;

  let value;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }
  return isValidRecord(value) && value.fingerprint === fingerprintValue ? value : null;
}

export function listSessions(storage) {
  const { records } = readStoredRecords(storage);
  return records;
}

export function restoreSession(storage, fingerprintValue, speakers = []) {
  const record = loadSession(storage, fingerprintValue);
  if (!record) return null;
  const validSpeakers = Array.isArray(speakers) ? speakers : [];
  const normalizedIdentity = typeof record.selectedIdentity === "string"
    ? record.selectedIdentity.normalize("NFC").trim()
    : "";
  const identityIsPresent = validSpeakers.some((speaker) => typeof speaker === "string"
    && speaker.normalize("NFC").trim() === normalizedIdentity);
  return {
    ...record,
    selectedIdentity: identityIsPresent ? record.selectedIdentity : null,
  };
}

export function clearAll(storage) {
  const { keys, error } = getOwnedKeys(storage);
  if (error) {
    return { success: false, cleared: 0, message: "Saved data could not be cleared because device storage is unavailable." };
  }

  let cleared = 0;
  let failed = false;
  for (const key of keys) {
    try {
      storage.removeItem(key);
      cleared += 1;
    } catch {
      failed = true;
    }
  }
  return {
    success: !failed,
    cleared,
    message: failed
      ? "Some saved data could not be cleared; check this browser's site storage."
      : "Saved data cleared from this device.",
  };
}
