function findMessage(snapshot, messageId) {
  if (!snapshot || !Array.isArray(snapshot.messages)) return null;
  return snapshot.messages.find((message) => message.messageId === messageId) || null;
}

export function validateEvidenceReference(snapshot, reference) {
  if (!snapshot || !reference || typeof reference !== "object") {
    return { status: "unverified", valid: false, semanticStatus: "unverified", reason: "No source reference was supplied." };
  }
  if (reference.snapshotId !== snapshot.snapshotId) {
    return { status: "stale", valid: false, semanticStatus: "unverified", reason: "The reference belongs to a different source snapshot." };
  }

  const message = findMessage(snapshot, reference.messageId);
  if (!message) {
    return { status: "stale", valid: false, semanticStatus: "unverified", reason: "The referenced message is not present in this snapshot." };
  }

  const { startOffset, endOffset } = reference;
  if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset) || startOffset < 0 || endOffset <= startOffset) {
    return { status: "invalid", valid: false, semanticStatus: "unverified", reason: "The source span is malformed." };
  }
  if (startOffset < message.startOffset || endOffset > message.endOffset || endOffset > snapshot.rawText.length) {
    return { status: "invalid", valid: false, semanticStatus: "unverified", reason: "The source span falls outside the referenced message." };
  }

  const quote = snapshot.rawText.slice(startOffset, endOffset);
  if (typeof reference.quote !== "string" || quote !== reference.quote) {
    return { status: "invalid", valid: false, semanticStatus: "unverified", reason: "The stored quotation does not exactly match the source span." };
  }

  return {
    status: "valid",
    valid: true,
    semanticStatus: "unverified",
    reason: "The reference and exact source span are valid; semantic support has not been assessed.",
    message,
  };
}

export function createEvidenceReference(snapshot, span) {
  if (!snapshot || !span || !Number.isSafeInteger(span.startOffset) || !Number.isSafeInteger(span.endOffset)) {
    return { status: "unverified", reference: null, semanticStatus: "unverified" };
  }

  const containingMessages = (snapshot.messages || []).filter((message) =>
    span.startOffset >= message.startOffset && span.endOffset <= message.endOffset
  );

  if (containingMessages.length === 0) {
    return { status: "stale", reference: null, semanticStatus: "unverified" };
  }
  if (containingMessages.length > 1) {
    return { status: "ambiguous", reference: null, semanticStatus: "unverified" };
  }

  const quote = snapshot.rawText.slice(span.startOffset, span.endOffset);
  const reference = {
    snapshotId: snapshot.snapshotId,
    messageId: containingMessages[0].messageId,
    startOffset: span.startOffset,
    endOffset: span.endOffset,
    quote,
  };
  const validation = validateEvidenceReference(snapshot, reference);
  return {
    status: validation.status,
    reference: validation.valid ? reference : null,
    semanticStatus: "unverified",
    reason: validation.reason,
  };
}

/**
 * Reconciles one old reference into a different snapshot only when exactly
 * one new message has identical full raw content and identical available
 * author/timestamp metadata. This never merges the two snapshots.
 */
export function remapEvidenceReference(reference, oldSnapshot, newSnapshot) {
  const oldValidation = validateEvidenceReference(oldSnapshot, reference);
  if (!oldValidation.valid) {
    return { status: "stale", reference: null, semanticStatus: "unverified", reason: "The original evidence reference is not valid." };
  }
  if (!newSnapshot || oldSnapshot.sourceFormat !== newSnapshot.sourceFormat || oldSnapshot.normalizerVersion !== newSnapshot.normalizerVersion) {
    return { status: "stale", reference: null, semanticStatus: "unverified", reason: "The source format or normalizer version changed." };
  }
  if (oldSnapshot.snapshotId === newSnapshot.snapshotId) {
    const unchangedValidation = validateEvidenceReference(newSnapshot, reference);
    return unchangedValidation.valid
      ? { status: "valid", reference, semanticStatus: "unverified", reason: "The source snapshot is unchanged." }
      : { status: "stale", reference: null, semanticStatus: "unverified", reason: "The reference is not valid in the unchanged snapshot." };
  }

  const oldMessage = oldValidation.message;
  const sameIdentity = (message) =>
    message.rawText === oldMessage.rawText &&
    message.authorRaw === oldMessage.authorRaw &&
    message.timestampRaw === oldMessage.timestampRaw;
  const oldMatches = (oldSnapshot.messages || []).filter(sameIdentity);
  if (oldMatches.length !== 1) {
    return { status: "ambiguous", reference: null, semanticStatus: "unverified", reason: "The original snapshot contains duplicate indistinguishable messages." };
  }
  const candidates = (newSnapshot?.messages || []).filter(sameIdentity);

  if (candidates.length === 0) {
    return { status: "stale", reference: null, semanticStatus: "unverified", reason: "No exact matching message exists in the new snapshot." };
  }
  if (candidates.length > 1) {
    return { status: "ambiguous", reference: null, semanticStatus: "unverified", reason: "Multiple exact matching messages exist in the new snapshot." };
  }

  const nextMessage = candidates[0];
  const relativeStart = reference.startOffset - oldMessage.startOffset;
  const relativeEnd = reference.endOffset - oldMessage.startOffset;
  const mapped = {
    snapshotId: newSnapshot.snapshotId,
    messageId: nextMessage.messageId,
    startOffset: nextMessage.startOffset + relativeStart,
    endOffset: nextMessage.startOffset + relativeEnd,
    quote: reference.quote,
  };
  const validation = validateEvidenceReference(newSnapshot, mapped);
  if (!validation.valid) {
    return { status: "stale", reference: null, semanticStatus: "unverified", reason: "The mapped span failed exact validation." };
  }
  return {
    status: "valid",
    reference: mapped,
    semanticStatus: "unverified",
    reason: "A unique exact message match was found; snapshots remain separate.",
  };
}
