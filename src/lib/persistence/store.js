const STORAGE_PREFIX = "unread-radar-ai:local-session:v1:";
export const SCHEMA_VERSION = 1;
export const MAX_SAVED_SESSIONS = 5;
export const MAX_RECORD_BYTES = 512 * 1024;

const UINT64_MASK = (1n << 64n) - 1n;
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FINGERPRINT_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const SNAPSHOT_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const TASK_STATUSES = new Set(["needs-review", "confirmed", "in-progress", "completed", "rejected"]);
const OUTCOMES = new Set(["confirmed", "possible"]);
const URGENCY_LEVELS = new Set(["High", "Medium", "Low"]);
const REVIEW_DECISIONS = new Set(["promoted", "rejected"]);

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

function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isSourceRange(value) {
  return isRecordObject(value)
    && Number.isSafeInteger(value.startOffset)
    && Number.isSafeInteger(value.endOffset)
    && value.startOffset >= 0
    && value.endOffset >= value.startOffset;
}

function isEvidenceReference(value) {
  return isRecordObject(value)
    && typeof value.quote === "string"
    && value.quote.length > 0
    && SNAPSHOT_PATTERN.test(value.snapshotId)
    && SNAPSHOT_PATTERN.test(value.messageId)
    && isSourceRange(value);
}

function isOptionalEvidence(value) {
  return value == null || isEvidenceReference(value);
}

function isOptionalString(value) {
  return value == null || typeof value === "string";
}

function hasValidEvidenceWhenClaimed(status, evidence) {
  return status !== "valid" || isEvidenceReference(evidence);
}

function isOptionalFiniteNumber(value) {
  return value == null || (typeof value === "number" && Number.isFinite(value));
}

function isOptionalBoolean(value) {
  return value == null || typeof value === "boolean";
}

function isLifecycleEvent(value) {
  return isRecordObject(value)
    && typeof value.type === "string"
    && isOptionalString(value.actor)
    && isOptionalString(value.text)
    && isOptionalString(value.newOwner)
    && isOptionalString(value.previousOwner)
    && isOptionalEvidence(value.evidence)
    && (value.sourceSpan == null || isSourceRange(value.sourceSpan))
    && isOptionalString(value.sourceReferenceStatus);
}

function isSupportingEvidence(value) {
  return isRecordObject(value)
    && isOptionalString(value.text)
    && isOptionalString(value.kind)
    && isOptionalEvidence(value.evidence)
    && (value.sourceSpan == null || isSourceRange(value.sourceSpan))
    && isOptionalString(value.sourceReferenceStatus);
}

function isTaskRecord(value) {
  if (!isRecordObject(value) || typeof value.id !== "string" || !value.id.trim()
    || typeof value.text !== "string" || !value.text.trim()
    || !isOptionalString(value.owner)
    || !isOptionalString(value.classification)
    || !isOptionalString(value.ownerSource)
    || !isOptionalString(value.outcomeReason)
    || !isOptionalString(value.extractionOutcomeReason)
    || !isOptionalString(value.ownerCandidateName)
    || !isOptionalString(value.dueDate)
    || !isOptionalString(value.resolvedDueDate)
    || !isOptionalString(value.dueDateStatus)
    || !isOptionalString(value.lifecycleStatus)
    || !isOptionalString(value.condition)
    || !isOptionalString(value.conditionStatus)
    || !isOptionalString(value.humanReviewStatus)
    || !isOptionalString(value.suggestedOwner)
    || !isOptionalString(value.suggestedDueDate)
    || !isOptionalString(value.suggestedResolvedDueDate)
    || !isOptionalString(value.reviewCandidateId)
    || !isOptionalString(value.acknowledgementReferenceStatus)
    || !isOptionalString(value.sourceReferenceStatus)
    || !isOptionalEvidence(value.sourceEvidence)
    || !isOptionalEvidence(value.acknowledgementEvidence)
    || !isOptionalEvidence(value.humanReviewEvidence)
    || !isOptionalEvidence(value.reviewSourceReference)
    || (value.sourceSpan != null && !isSourceRange(value.sourceSpan))
    || (value.acknowledgementSpan != null && !isSourceRange(value.acknowledgementSpan))
    || (value.outcome != null && !OUTCOMES.has(value.outcome))
    || (value.urgency != null && !URGENCY_LEVELS.has(value.urgency))
    || !isOptionalFiniteNumber(value.confidence)
    || !isOptionalBoolean(value.completed)
    || !isOptionalBoolean(value.cancelled)
    || (value.lifecycleEvents != null
      && (!Array.isArray(value.lifecycleEvents) || !value.lifecycleEvents.every(isLifecycleEvent)))
    || (value.supportingEvidence != null
      && (!Array.isArray(value.supportingEvidence) || !value.supportingEvidence.every(isSupportingEvidence)))
    || (value.supportingDetails != null
      && (!Array.isArray(value.supportingDetails) || !value.supportingDetails.every(isSupportingEvidence)))) {
    return false;
  }
  return value.sourceReferenceStatus !== "valid" || isEvidenceReference(value.sourceEvidence);
}

function isReviewCandidate(value) {
  return isRecordObject(value)
    && typeof value.id === "string"
    && value.id.trim().length > 0
    && typeof value.text === "string"
    && value.text.trim().length > 0
    && isEvidenceReference(value.sourceEvidence)
    && value.sourceReferenceStatus === "valid"
    && isOptionalString(value.reasonLabel)
    && isOptionalString(value.owner)
    && isOptionalString(value.dueDate)
    && isOptionalString(value.resolvedDueDate)
    && isOptionalString(value.extractionState)
    && (value.outcome == null || OUTCOMES.has(value.outcome))
    && (value.missing == null || (Array.isArray(value.missing) && value.missing.every((item) => typeof item === "string")));
}

function isAnalysisRecord(value) {
  const listFields = ["summary", "actions", "reviewQueue", "decisions", "deadlines", "mentions", "urgentRows", "alerts"];
  if (!isRecordObject(value) || !listFields.every((field) => Array.isArray(value[field]))) return false;
  if (!value.summary.every((item) => typeof item === "string")
    || !value.actions.every(isTaskRecord)
    || !value.reviewQueue.every(isReviewCandidate)
    || !value.decisions.every((item) => typeof item === "string"
      || (isRecordObject(item) && typeof item.text === "string"))
    || !value.deadlines.every((item) => isRecordObject(item)
      && typeof item.id === "string"
      && typeof item.text === "string"
      && Array.isArray(item.dates)
      && item.dates.every((date) => typeof date === "string")
      && isOptionalEvidence(item.sourceEvidence)
      && isOptionalString(item.sourceReferenceStatus)
      && hasValidEvidenceWhenClaimed(item.sourceReferenceStatus, item.sourceEvidence)
      && (item.urgency == null || URGENCY_LEVELS.has(item.urgency)))
    || !value.mentions.every((item) => isRecordObject(item)
      && typeof item.handle === "string"
      && typeof item.line === "string"
      && isOptionalEvidence(item.sourceEvidence)
      && isOptionalString(item.sourceReferenceStatus)
      && hasValidEvidenceWhenClaimed(item.sourceReferenceStatus, item.sourceEvidence)
      && (item.urgency == null || URGENCY_LEVELS.has(item.urgency)))
    || !value.urgentRows.every((item) => isRecordObject(item)
      && typeof item.id === "string"
      && typeof item.text === "string"
      && isOptionalString(item.reason)
      && isOptionalEvidence(item.sourceEvidence)
      && isOptionalString(item.sourceReferenceStatus)
      && hasValidEvidenceWhenClaimed(item.sourceReferenceStatus, item.sourceEvidence)
      && (item.urgency == null || URGENCY_LEVELS.has(item.urgency)))
    || !value.alerts.every(isTaskRecord)
    || (value.summaryEvidence != null && !Array.isArray(value.summaryEvidence))
    || (value.decisionFindings != null && (!Array.isArray(value.decisionFindings)
      || !value.decisionFindings.every((item) => isRecordObject(item) && typeof item.text === "string")))
    || (value.lineCount != null && (!Number.isSafeInteger(value.lineCount) || value.lineCount < 0))
    || (value.sourceChunks != null && (!Number.isSafeInteger(value.sourceChunks) || value.sourceChunks < 0))
    || (value.modelId != null && typeof value.modelId !== "string")) {
    return false;
  }
  return true;
}

function isReviewDecisions(value) {
  return isRecordObject(value) && Object.entries(value).every(([id, decision]) => id.trim().length > 0
    && isRecordObject(decision)
    && REVIEW_DECISIONS.has(decision.decision)
    && isIsoTimestamp(decision.reviewedAt));
}

function isTaskStatuses(value) {
  return isRecordObject(value) && Object.entries(value).every(([id, status]) => id.trim().length > 0
    && TASK_STATUSES.has(status));
}

function isValidRecord(value) {
  if (!isRecordObject(value)
    || value.schemaVersion !== SCHEMA_VERSION
    || typeof value.fingerprint !== "string"
    || !FINGERPRINT_PATTERN.test(value.fingerprint)
    || !isIsoTimestamp(value.savedAt)
    || !isAnalysisRecord(value.analysis)
    || !isReviewDecisions(value.reviewDecisions)
    || !isTaskStatuses(value.taskStatuses)
    || !(value.selectedIdentity === null || (typeof value.selectedIdentity === "string" && value.selectedIdentity.length <= 160))
    || !Array.isArray(value.sourceMessageFingerprints)
    || !value.sourceMessageFingerprints.every((item) => typeof item === "string" && FINGERPRINT_PATTERN.test(item))
    || typeof value.sourceSnapshotId !== "string"
    || !SNAPSHOT_PATTERN.test(value.sourceSnapshotId)
    || !Array.isArray(value.sourceMessageRanges)
    || !value.sourceMessageRanges.every(isSourceRange)
    || value.sourceMessageRanges.length !== value.sourceMessageFingerprints.length
    || (value.analysis.sourceSnapshotId != null && value.analysis.sourceSnapshotId !== value.sourceSnapshotId)) {
    return false;
  }
  const taskIds = value.analysis.actions.map((task) => task.id);
  return new Set(taskIds).size === taskIds.length && haveValidAnalysisReferences(value.analysis, value);
}

function isWithinMessageRanges(location, record) {
  return record.sourceMessageRanges.some((range) => (
    location.startOffset >= range.startOffset && location.endOffset <= range.endOffset
  ));
}

function haveValidAnalysisReferences(value, record) {
  if (Array.isArray(value)) return value.every((item) => haveValidAnalysisReferences(item, record));
  if (!isRecordObject(value)) return true;

  if ("snapshotId" in value || "messageId" in value) {
    if (!isEvidenceReference(value)
      || value.snapshotId !== record.sourceSnapshotId
      || !isWithinMessageRanges(value, record)) {
      return false;
    }
  } else if ("startOffset" in value || "endOffset" in value) {
    if (!isSourceRange(value) || !isWithinMessageRanges(value, record)) return false;
  }

  return Object.values(value).every((item) => haveValidAnalysisReferences(item, record));
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
    try {
      if (recordBytes(serialized) > MAX_RECORD_BYTES) continue;
    } catch {
      continue;
    }

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
  if (!isValidRecord(record)) {
    return null;
  }
  return {
    fingerprint: record.fingerprint,
    savedAt: record.savedAt,
    schemaVersion: SCHEMA_VERSION,
    analysis: record.analysis,
    reviewDecisions: record.reviewDecisions,
    taskStatuses: record.taskStatuses,
    selectedIdentity: record.selectedIdentity,
    sourceMessageFingerprints: record.sourceMessageFingerprints,
    sourceSnapshotId: record.sourceSnapshotId,
    sourceMessageRanges: record.sourceMessageRanges.map(({ startOffset, endOffset }) => ({ startOffset, endOffset })),
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
  try {
    if (recordBytes(serialized) > MAX_RECORD_BYTES) return null;
  } catch {
    return null;
  }

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
