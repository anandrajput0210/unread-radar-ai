import { recordMeta } from "./records.js";

// One recency policy shared by acknowledgement, commitment and progress claims.
export const CLAIM_WINDOW = 3;
export const CLAIM_CONTENT_THRESHOLD = 0.3;

export function sameSpeaker(left, right) {
  // Unknown attribution never proves that two messages came from different people.
  if (!left || !right) return true;
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

export function speakerForAction(records, action, options = {}) {
  const record = records.find((item) => item.startOffset === action?.sourceSpan?.startOffset);
  return record ? recordMeta(record, options).speaker ?? null : null;
}

export function isKnownOtherRequester(records, action, speaker, options = {}) {
  const requester = speakerForAction(records, action, options);
  return Boolean(requester && speaker) && !sameSpeaker(requester, speaker);
}

export function isWithinClaimWindow(records, action, record) {
  if (!action?.sourceSpan || !record) return false;
  if (action.sourceSpan.startOffset >= record.startOffset) return false;
  const recentStarts = new Set(records
    .filter((item) => item.startOffset < record.startOffset)
    .slice(-CLAIM_WINDOW)
    .map((item) => item.startOffset));
  return recentStarts.has(action.sourceSpan.startOffset);
}

/**
 * A request can be claimed only when it is still unowned, unacknowledged,
 * recent, and was raised by a known person other than the responding speaker.
 */
export function isEligibleUnownedClaim(records, action, record, speaker, options = {}) {
  return Boolean(action && !action.owner && !action.acknowledgedBy
    && !["completed", "cancelled"].includes(action.lifecycleStatus)
    && isWithinClaimWindow(records, action, record)
    && isKnownOtherRequester(records, action, speaker, options));
}
