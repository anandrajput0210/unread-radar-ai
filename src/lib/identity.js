function participantTokens(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/^@/u, "")
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter(Boolean);
}

function isSubset(left, right) {
  return left.length > 0 && left.every((token) => right.includes(token));
}

export function normalizeParticipantName(value) {
  return participantTokens(value).join(" ");
}

export function findMatchingParticipants(name, speakers) {
  const nameTokens = participantTokens(name);
  if (!nameTokens.length) return [];

  const distinct = [];
  const seen = new Set();
  for (const speaker of Array.isArray(speakers) ? speakers : []) {
    if (typeof speaker !== "string" || !speaker.trim()) continue;
    const key = normalizeParticipantName(speaker);
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push({ name: speaker.trim(), key, tokens: participantTokens(speaker) });
  }

  const exact = distinct.filter((speaker) => speaker.key === nameTokens.join(" "));
  if (exact.length) return exact.map((speaker) => speaker.name);

  return distinct
    .filter((speaker) => isSubset(nameTokens, speaker.tokens) || isSubset(speaker.tokens, nameTokens))
    .map((speaker) => speaker.name);
}

export function resolveParticipantIdentity(name, speakers) {
  const matches = findMatchingParticipants(name, speakers);
  if (matches.length === 1) return { status: "resolved", participant: matches[0] };
  if (matches.length > 1) return { status: "ambiguous", participant: null };
  return { status: "none", participant: null };
}

export function sameParticipantIdentity(left, right, speakers) {
  const leftIdentity = resolveParticipantIdentity(left, speakers);
  const rightIdentity = resolveParticipantIdentity(right, speakers);
  return leftIdentity.status === "resolved"
    && rightIdentity.status === "resolved"
    && normalizeParticipantName(leftIdentity.participant) === normalizeParticipantName(rightIdentity.participant);
}
