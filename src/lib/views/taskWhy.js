const CLAIM_SOURCES = new Set([
  "claimed_by_commitment",
  "claimed_by_progress",
  "unique_acknowledgement",
]);

function normalizedTokens(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/^@/u, "")
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter(Boolean);
}

function matchesOwner(owner, speaker) {
  const ownerTokens = normalizedTokens(owner);
  const speakerTokens = normalizedTokens(speaker);
  return ownerTokens.length > 0
    && (ownerTokens.every((token) => speakerTokens.includes(token))
      || speakerTokens.every((token) => ownerTokens.includes(token)));
}

function matchingSpeakers(owner, speakers) {
  const matches = speakers.filter((speaker) => matchesOwner(owner, speaker));
  const exact = matches.filter((speaker) => normalizedTokens(speaker).join(" ") === normalizedTokens(owner).join(" "));
  return exact.length ? exact : matches;
}

function hasNamedOwner(quote, owner) {
  const name = String(owner ?? "").trim().replace(/^@/u, "");
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])@?${escaped}(?![\\p{L}\\p{N}])`, "iu").test(quote);
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
    return {
      status: "unknown",
      reason: "No owner could be established from this chat.",
    };
  }

  if (matchingSpeakers(owner, speakers).length > 1) {
    return {
      status: "ambiguous",
      reason: "This owner name matches more than one speaker in the chat.",
    };
  }

  if (CLAIM_SOURCES.has(task.ownerSource) || task.classification === "self_commitment") {
    return {
      status: "claimed-by-speaker",
      reason: "The task records a speaker's own commitment or acceptance.",
    };
  }

  const quote = typeof task.sourceEvidence?.quote === "string" ? task.sourceEvidence.quote : "";
  const reassignedToOwner = (Array.isArray(task.lifecycleEvents) ? task.lifecycleEvents : [])
    .some((event) => event?.type === "reassigned" && matchesOwner(owner, event.newOwner));
  if (hasNamedOwner(quote, owner) || reassignedToOwner) {
    return {
      status: "named-in-request",
      reason: reassignedToOwner
        ? "The conversation explicitly names this owner in a reassignment event."
        : "The request explicitly names this owner.",
    };
  }

  if (task.ownerSource === "implied_addressee" || task.ownerSource === "implied-addressee") {
    return {
      status: "implied-addressee",
      reason: "The extracted task identifies this person as its implied addressee.",
    };
  }

  return {
    status: "implied-addressee",
    reason: "The extracted task records this owner, but no more specific basis is available.",
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

export function buildTaskWhy(task, { messages = [], speakers = [] } = {}) {
  const sourceMessages = Array.isArray(messages) ? messages : [];
  const speakerList = Array.isArray(speakers) ? speakers.filter((name) => typeof name === "string") : [];
  const evidenceReference = task?.sourceEvidence || null;
  const evidence = {
    quote: typeof evidenceReference?.quote === "string" ? evidenceReference.quote : null,
    messageIndex: findMessageIndex(evidenceReference || task?.sourceSpan, sourceMessages),
    referenceStatus: typeof task?.sourceReferenceStatus === "string"
      ? task.sourceReferenceStatus
      : evidenceReference ? "unverified" : "missing",
  };
  const caveats = [];
  if (task?.outcome === "possible") caveats.push("Possible task - not confirmed");
  const ownerBasis = buildOwnerBasis(task, speakerList);
  if (ownerBasis.status === "ambiguous") caveats.push("Owner unclear");
  if (evidence.referenceStatus !== "valid") caveats.push("Source reference could not be verified");

  return {
    ownerBasis,
    timing: buildTiming(task),
    timeline: buildTimeline(task, sourceMessages),
    evidence,
    caveats,
  };
}
