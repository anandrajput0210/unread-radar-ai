import { createSourceSnapshot } from "../import/sourceSnapshot.js";
import { listSpeakers } from "../views/catchUpBrief.js";
import {
  fingerprint,
  listSessions,
  loadSession,
  persistIfEnabled,
  restoreSession,
  SCHEMA_VERSION,
} from "./store.js";

const DISMISSED_WORKSPACES_KEY = "unread-radar-ai:dismissed-workspaces:v1";
const FINGERPRINT_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const MAX_DISMISSED_WORKSPACES = 5;

export function sourceMessageFingerprints(snapshot) {
  return (snapshot?.messages || []).map((message) => fingerprint(JSON.stringify([
    message.authorRaw || "",
    message.timestampRaw || "",
    (message.rawText || "").replace(/(?:\r\n|\r|\n)+$/u, ""),
  ])));
}

export function sourceMessageRanges(snapshot) {
  return (snapshot?.messages || []).map(({ startOffset, endOffset }) => ({ startOffset, endOffset }));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function referencesMatchSource(value, sourceText, snapshot, messagesById) {
  if (Array.isArray(value)) {
    return value.every((item) => referencesMatchSource(item, sourceText, snapshot, messagesById));
  }
  if (!value || typeof value !== "object") return true;

  if ("snapshotId" in value || "messageId" in value) {
    const message = messagesById.get(value.messageId);
    if (!message
      || value.snapshotId !== snapshot.snapshotId
      || value.startOffset < message.startOffset
      || value.endOffset > message.endOffset
      || sourceText.slice(value.startOffset, value.endOffset) !== value.quote) {
      return false;
    }
  } else if ("startOffset" in value || "endOffset" in value) {
    if (!Number.isSafeInteger(value.startOffset)
      || !Number.isSafeInteger(value.endOffset)
      || value.startOffset < 0
      || value.endOffset < value.startOffset
      || value.endOffset > sourceText.length) {
      return false;
    }
  }

  return Object.values(value).every((item) => referencesMatchSource(item, sourceText, snapshot, messagesById));
}

export function listSavedWorkspaces(storage) {
  return listSessions(storage);
}

export function filterVisibleSavedWorkspaces(savedWorkspaces, dismissedFingerprints, activeFingerprint) {
  return savedWorkspaces.filter((workspace) => (
    workspace.fingerprint !== activeFingerprint
    && !dismissedFingerprints.has(workspace.fingerprint)
  ));
}

export function loadDismissedWorkspaces(storage) {
  try {
    const stored = storage?.getItem(DISMISSED_WORKSPACES_KEY);
    if (typeof stored !== "string") return new Set();
    const values = JSON.parse(stored);
    return new Set(Array.isArray(values)
      ? values.filter((value) => typeof value === "string" && FINGERPRINT_PATTERN.test(value))
      : []);
  } catch {
    return new Set();
  }
}

export function saveDismissedWorkspaces(storage, fingerprints) {
  const values = [...new Set(Array.from(fingerprints || [])
    .filter((value) => typeof value === "string" && FINGERPRINT_PATTERN.test(value)))]
    .slice(-MAX_DISMISSED_WORKSPACES);
  try {
    storage.setItem(DISMISSED_WORKSPACES_KEY, JSON.stringify(values));
    return { success: true };
  } catch {
    return {
      success: false,
      message: "Dismissal could not be kept for this browser tab session.",
    };
  }
}

export function saveWorkspace(storage, enabled, workspace) {
  if (!enabled) return persistIfEnabled(storage, false, null);
  const snapshot = workspace?.sourceSnapshot;
  if (!snapshot || typeof snapshot.rawText !== "string") {
    return {
      saved: false,
      status: "not-saved",
      reason: "missing-source",
      message: "This analysis was not saved because its source snapshot is unavailable.",
    };
  }

  const dateOrder = snapshot.dateOrder?.basis === "user-selected"
    ? snapshot.dateOrder.order
    : "auto";
  const record = {
    fingerprint: fingerprint(snapshot.rawText),
    sourceText: snapshot.rawText,
    dateOrder,
    savedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    analysis: workspace.analysis,
    reviewDecisions: workspace.reviewDecisions || {},
    taskStatuses: workspace.taskStatuses || {},
    selectedIdentity: typeof workspace.selectedIdentity === "string" ? workspace.selectedIdentity : null,
    sourceMessageFingerprints: sourceMessageFingerprints(snapshot),
    sourceSnapshotId: snapshot.snapshotId,
    sourceMessageRanges: sourceMessageRanges(snapshot),
  };
  return persistIfEnabled(storage, true, record);
}

export async function restoreSavedWorkspace(storage, fingerprintValue) {
  const saved = loadSession(storage, fingerprintValue);
  if (!saved) return { ok: false, reason: "not-found" };

  let sourceSnapshot;
  try {
    sourceSnapshot = await createSourceSnapshot(saved.sourceText, {
      dateOrder: saved.dateOrder === "auto" ? undefined : saved.dateOrder,
    });
  } catch {
    return { ok: false, reason: "invalid-source" };
  }

  const expectedRanges = sourceMessageRanges(sourceSnapshot);
  const expectedFingerprints = sourceMessageFingerprints(sourceSnapshot);
  if (sourceSnapshot.snapshotId !== saved.sourceSnapshotId
    || !sameJson(expectedRanges, saved.sourceMessageRanges)
    || !sameJson(expectedFingerprints, saved.sourceMessageFingerprints)) {
    return { ok: false, reason: "source-mismatch" };
  }

  const restored = restoreSession(storage, saved.fingerprint, listSpeakers(sourceSnapshot));
  if (!restored) return { ok: false, reason: "not-found" };
  if (restored.sourceText !== saved.sourceText
    || restored.sourceSnapshotId !== saved.sourceSnapshotId
    || !sameJson(restored.sourceMessageRanges, saved.sourceMessageRanges)
    || !sameJson(restored.sourceMessageFingerprints, saved.sourceMessageFingerprints)) {
    return { ok: false, reason: "source-mismatch" };
  }
  const messagesById = new Map(sourceSnapshot.messages.map((message) => [message.messageId, message]));
  if (!referencesMatchSource(restored.analysis, restored.sourceText, sourceSnapshot, messagesById)) {
    return { ok: false, reason: "invalid-evidence" };
  }
  return {
    ok: true,
    chatText: restored.sourceText,
    dateOrder: restored.dateOrder,
    sourceSnapshot,
    speakers: listSpeakers(sourceSnapshot),
    analysis: restored.analysis,
    reviewDecisions: restored.reviewDecisions,
    taskStatuses: restored.taskStatuses,
    selectedIdentity: restored.selectedIdentity,
    savedAt: restored.savedAt,
    fingerprint: restored.fingerprint,
  };
}
