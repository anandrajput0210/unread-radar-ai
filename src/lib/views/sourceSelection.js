export function resolveSourceMessageIndex(snapshot, reference, referenceStatus) {
  if (referenceStatus !== "valid"
    || !snapshot
    || reference?.snapshotId !== snapshot.snapshotId
    || !Number.isSafeInteger(reference.startOffset)
    || !Number.isSafeInteger(reference.endOffset)
    || reference.startOffset < 0
    || reference.endOffset <= reference.startOffset) {
    return null;
  }

  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
  const index = messages.findIndex((message) => Number.isSafeInteger(message?.startOffset)
    && Number.isSafeInteger(message?.endOffset)
    && reference.startOffset >= message.startOffset
    && reference.endOffset <= message.endOffset);
  return index < 0 ? null : index;
}
