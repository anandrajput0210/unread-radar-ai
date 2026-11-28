import { resolveParticipantIdentity, sameParticipantIdentity } from "../identity.js";

const CLAIM_SOURCES = new Set([
  "claimed_by_commitment",
  "claimed_by_progress",
  "unique_acknowledgement",
]);

const HUMAN_REVIEW_TEXT = Object.freeze({
  "needs-review": "Awaiting your review.",
  confirmed: "Confirmed by you.",
  "in-progress": "Marked in progress by you.",
  completed: "Marked completed by you; conversation lifecycle remains separate.",
  rejected: "Rejected by you; the extraction outcome remains separate.",
  promoted: "Accepted for tracking by you.",
});

function buildHumanReview(task, reviewStatus) {
  const status = reviewStatus && reviewStatus !== "needs-review"
    ? reviewStatus
    : task?.humanReviewStatus === "promoted" ? "promoted" : "needs-review";
  return {
    status: Object.hasOwn(HUMAN_REVIEW_TEXT, status) ? status : "needs-review",
    text: HUMAN_REVIEW_TEXT[status] || HUMAN_REVIEW_TEXT["needs-review"],
  };
}

function buildExtraction(task) {
  const status = task?.outcome === "confirmed" || task?.outcome === "possible"
    ? task.outcome
    : "unknown";
  return {
    status,
    reviewReason: status === "possible" ? "Not confirmed. Needs a human look." : null,
    label: status === "possible"
      ? "Possible candidate"
      : status === "confirmed" ? "Confirmed extraction" : "No extraction outcome recorded",
    reason: typeof (task?.extractionOutcomeReason || task?.outcomeReason) === "string"
      ? task.extractionOutcomeReason || task.outcomeReason
      : null,
  };
}

function sourceOffset(reference) {
  if (!reference || !Number.isSafeInteger(reference.startOffset)) return null;
  return reference.startOffset;
}

function findMessageIndex(reference, messages) {
  if (reference?.messageId) {
    const matchingId = messages.findIndex((message) => message?.messageId === reference.messageId);
    if (matchingId >= 0) return matchingId;
  }
  if (!Number.isSafeInteger(reference?.startOffset) || !Number.isSafeInteger(reference?.endOffset)) return null;
  const index = messages.findIndex((message) => Number.isSafeInteger(message?.startOffset)
    && Number.isSafeInteger(message?.endOffset)
    && reference.startOffset >= message.startOffset
    && reference.endOffset <= message.endOffset);
  return index < 0 ? null : index;
}

function speakerAt(messages, messageIndex) {
  const author = messageIndex === null ? null : messages[messageIndex]?.authorRaw;
  return typeof author === "string" && author.trim() ? author.trim() : null;
}

function buildOwnerBasis(task, speakers) {
  const owner = typeof task?.owner === "string" ? task.owner.trim() : "";
  if (!owner) {
    if (task?.ownerBasis === "disputed") {
      return {
        status: "disputed",
        reason: "More than one person may own this. Not guessing.",
      };
    }
    if (task?.ownerBasis === "ambiguous") {
      return {
        status: "ambiguous",
        reason: "More than one person could match. Not guessing.",
      };
    }
    if (task?.classification === "collective_task") {
      return {
        status: "collective",
        reason: "This is a collective obligation; no individual owner was established.",
      };
    }
    if (task?.classification === "unassigned_request" || task?.classification === "unassigned_action") {
      return {
        status: "unassigned-request",
        reason: "No owner was named or claimed in this chat. Not guessing.",
      };
    }
    return {
      status: "unknown",
      reason: "No owner was named or claimed in this chat. Not guessing.",
    };
  }

  if (resolveParticipantIdentity(owner, speakers).status === "ambiguous") {
    return {
      status: "ambiguous",
      reason: "More than one person could match. Not guessing.",
    };
  }

  if (CLAIM_SOURCES.has(task.ownerSource) || task.classification === "self_commitment") {
    return {
      status: "claimed-by-speaker",
      reason: "The task records a speaker's own commitment or acceptance.",
    };
  }

  const reassignedToOwner = (Array.isArray(task.lifecycleEvents) ? task.lifecycleEvents : [])
    .some((event) => event?.type === "reassigned"
      && sameParticipantIdentity(owner, event.newOwner, speakers));
  if (task.ownerBasis === "implied-addressee"
    || task.ownerSource === "implied_addressee"
    || task.ownerSource === "implied-addressee") {
    return {
      status: "implied-addressee",
      reason: "The extracted task identifies this person as its implied addressee.",
    };
  }

  if (reassignedToOwner || task.ownerSource === "conversation_reassignment") {
    return {
      status: "named-in-request",
      reason: "The conversation records this owner in a reassignment event.",
    };
  }

  if (task.ownerBasis === "named-in-request" || task.classification === "assigned_task") {
    return {
      status: "named-in-request",
      reason: "The extractor classified this as an assigned task with a named owner.",
    };
  }

  return {
    status: "unknown",
    reason: "The extractor recorded an owner, but its assignment basis is not recorded.",
  };
}

function buildTiming(task) {
  const dueDate = typeof task?.dueDate === "string" ? task.dueDate.trim() : "";
  const resolvedDueDate = typeof task?.resolvedDueDate === "string" && task.resolvedDueDate
    ? task.resolvedDueDate
    : null;
  if (task?.dueDateStatus === "explicit") {
    return {
      text: `${dueDate || "Explicit deadline"}${resolvedDueDate ? ` (resolved to ${resolvedDueDate})` : ""}`,
      resolvedDueDate,
      status: "explicit",
    };
  }
  if (task?.dueDateStatus === "contextual") {
    return {
      text: `Inferred from context${dueDate ? `: ${dueDate}` : ""}${resolvedDueDate ? ` (resolved to ${resolvedDueDate})` : ""}`,
      resolvedDueDate,
      status: "contextual",
    };
  }
  if (dueDate) {
    return {
      text: `Unverified timing signal: ${dueDate}`,
      resolvedDueDate,
      status: "none",
    };
  }
  return {
    text: "No deadline established from this chat.",
    resolvedDueDate: null,
    status: "none",
  };
}

function buildTimeline(task, messages) {
  const events = [];
  const requestReference = task?.sourceEvidence || task?.sourceSpan;
  const requestQuote = typeof task?.sourceEvidence?.quote === "string" ? task.sourceEvidence.quote : "";
  if (requestQuote) {
    const messageIndex = findMessageIndex(requestReference, messages);
    events.push({
      type: "request",
      quote: requestQuote,
      speaker: speakerAt(messages, messageIndex),
      messageIndex,
      referenceStatus: typeof task.sourceReferenceStatus === "string" ? task.sourceReferenceStatus : "unverified",
      offset: sourceOffset(requestReference),
    });
  }

  for (const event of Array.isArray(task?.lifecycleEvents) ? task.lifecycleEvents : []) {
    if (!event || typeof event !== "object") continue;
    const reference = event.evidence || event.sourceSpan;
    const quote = typeof event.evidence?.quote === "string"
      ? event.evidence.quote
      : typeof event.text === "string" ? event.text : "";
    if (!quote) continue;
    const messageIndex = findMessageIndex(reference, messages);
    events.push({
      type: typeof event.type === "string" ? event.type : "lifecycle",
      quote,
      speaker: typeof event.actor === "string" && event.actor.trim()
        ? event.actor.trim()
        : speakerAt(messages, messageIndex),
      messageIndex,
      referenceStatus: typeof event.sourceReferenceStatus === "string"
        ? event.sourceReferenceStatus
        : "unverified",
      offset: sourceOffset(reference),
    });
  }

  for (const detail of Array.isArray(task?.supportingEvidence) ? task.supportingEvidence : []) {
    if (detail?.kind !== "duplicate-occurrence") continue;
    const reference = detail.evidence || detail.sourceSpan;
    const quote = typeof detail.evidence?.quote === "string"
      ? detail.evidence.quote
      : typeof detail.text === "string" ? detail.text : "";
    if (!quote) continue;
    const messageIndex = findMessageIndex(reference, messages);
    events.push({
      type: "repeated-request",
      quote,
      speaker: speakerAt(messages, messageIndex),
      messageIndex,
      referenceStatus: typeof detail.sourceReferenceStatus === "string"
        ? detail.sourceReferenceStatus
        : "unverified",
      offset: sourceOffset(reference),
    });
  }

  return events
    .sort((left, right) => {
      if (left.offset !== null && right.offset !== null) return left.offset - right.offset;
      if (left.messageIndex !== null && right.messageIndex !== null) return left.messageIndex - right.messageIndex;
      return 0;
    })
    .map(({ offset, ...event }) => event);
}

export function buildTaskWhy(task, { messages = [], speakers = [], reviewStatus } = {}) {
  const sourceMessages = Array.isArray(messages) ? messages : [];
  const speakerList = Array.isArray(speakers) ? speakers.filter((name) => typeof name === "string") : [];
  const humanReview = buildHumanReview(task, reviewStatus);
  const extraction = buildExtraction(task);
  const evidenceReference = task?.sourceEvidence || null;
  const evidence = {
    quote: typeof evidenceReference?.quote === "string" ? evidenceReference.quote : null,
    messageIndex: findMessageIndex(evidenceReference || task?.sourceSpan, sourceMessages),
    referenceStatus: typeof task?.sourceReferenceStatus === "string"
      ? task.sourceReferenceStatus
      : evidenceReference ? "unverified" : "missing",
  };
  const caveats = [];
  if (extraction.status === "possible" && humanReview.status === "needs-review") {
    caveats.push("Possible task - not confirmed");
  }
  const ownerBasis = buildOwnerBasis(task, speakerList);
  if (ownerBasis.status === "ambiguous") caveats.push("Owner unclear");
  if (evidence.referenceStatus !== "valid") caveats.push("Source reference could not be verified");

  return {
    ownerBasis,
    extraction,
    humanReview,
    timing: buildTiming(task),
    timeline: buildTimeline(task, sourceMessages),
    evidence,
    caveats,
  };
}
