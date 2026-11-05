import { TASK_VERB_SOURCE } from "./constants.js";
import { recordMeta } from "./records.js";

export function conditionFor(body) {
  const match = String(body ?? "").match(/\b(?:once|after|when|if|until|unless|provided\s+that|subject\s+to)\s+(?:we\s+get\s+)?(?:the\s+)?(?:client|customer|legal|qa|approval|reply|response|wording|sign[- ]?off)[^.!?]*/iu);
  return match ? match[0].trim().replace(/[.!?]+$/u, "") : null;
}

export function extractBlockedPrecondition(body) {
  const pattern = new RegExp(
    String.raw`\b(?:I|we)\s+(?:won['’]t|will\s+not|cannot|can['’]t|should\s+not|shouldn['’]t)\s+(?<action>(?:${TASK_VERB_SOURCE})\b[\s\S]*?)\s+until\s+(?<condition>[^.!?]+)`,
    "iu",
  );
  const match = String(body ?? "").match(pattern);
  if (!match?.groups?.action || !match?.groups?.condition) return null;
  return {
    actionText: match.groups.action.trim(),
    condition: `until ${match.groups.condition.trim()}`,
  };
}

export function hasConditionStateMatch(source, pattern) {
  const regex = new RegExp(pattern.source, "giu");
  let match;
  while ((match = regex.exec(source)) !== null) {
    const matchedText = match[0];
    const prefix = source.slice(Math.max(0, match.index - 48), match.index);
    const isHypothetical = /\b(?:until|once|if|after|when|unless|provided\s+that|subject\s+to|waiting\s+for|awaiting)\s*[^.!?]{0,44}$/iu.test(prefix);
    const isNegated = /\b(?:not|never|no\s+longer|has\s+not|have\s+not|had\s+not|is\s+not|are\s+not|was\s+not|were\s+not|not\s+yet)\b/iu.test(matchedText) ||
      /\b(?:not|never|has\s+not|have\s+not|had\s+not|is\s+not|are\s+not|was\s+not|were\s+not|not\s+yet)\s*$/iu.test(prefix);
    if (!isHypothetical && !isNegated) return true;
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return false;
}

export function conditionEvidenceStatus(body, condition) {
  const source = String(body ?? "").toLocaleLowerCase();
  const requirement = String(condition ?? "").toLocaleLowerCase();

  if (/\b(?:legal|qa|compliance|approval|approves|approved|sign[- ]?off|wording)\b/u.test(requirement)) {
    // Evidence may come from Legal, Compliance, QA, or another participant
    // explicitly reporting the approval state. Do not require the speaker to
    // be the task owner: cross-speaker condition updates are expected.
    const explicitOverride = hasExplicitConditionOverride(source);
    const pendingNegation = /\b(?:not yet approved|not approved yet|awaiting approval|approval is pending|approval remains pending|still awaiting (?:legal )?approval)\b/iu.test(source);
    const negativeApproval = !pendingNegation && (
      /\b(?:the\s+)?(?:wording|approval|sign[- ]?off)\s+(?:(?:has|have|had)\s+)?(?:not|never)\s+(?:yet\s+)?(?:been\s+)?approved\b/iu.test(source)
      || /\b(?:legal|qa|compliance)\s+(?:(?:has|have|had|is|was|were)\s+)?(?:not|never)\s+approved\b/iu.test(source)
      || /\bnot\s+(?:yet\s+)?approved\b/iu.test(source)
    );
    const approved = hasConditionStateMatch(source, /\b(?:legal|qa|compliance)\s+(?:(?:has|have|had|is|was|were)\s+)?(?:approved|approves|signed\s+off|cleared|passed)\b|\b(?:approved|signed\s+off|cleared|passed)\s+by\s+(?:legal|qa|compliance)\b|\bapproval\s+(?:(?:was|is|has\s+been|has)\s+)?(?:received|granted)\b|\b(?:wording|sign[- ]?off)\s+(?:(?:has\s+been|was|is)\s+)?approved\b/iu);
    const rejected = negativeApproval || hasConditionStateMatch(source, /\b(?:legal|qa|compliance)\s+(?:(?:has|have|had|is|was|were)\s+)?(?:rejected|denied|declined|refused|failed|revoked|withdrew|rescinded|reversed|overturned)\b|\b(?:rejected|denied|declined|refused|failed|revoked|withdrawn|rescinded|reversed|overturned)\s+by\s+(?:legal|qa|compliance)\b|\b(?:approval|sign[- ]?off)\s+(?:(?:is|was|has\s+been|has)\s+)?(?:rejected|denied|refused|revoked|withdrawn|rescinded|reversed|overturned)\b|\b(?:revoked|withdrew|rescinded|reversed|overturned)\s+(?:the\s+)?(?:approval|sign[- ]?off)\b|\b(?:wording|sign[- ]?off)\s+(?:(?:was|is|has\s+been)\s+)?(?:rejected|denied|declined|refused)\b/iu);

    if (approved && rejected) {
      // A single explicit correction/revocation makes the current state clear;
      // otherwise a message containing both states is intrinsically ambiguous.
      if (explicitOverride && rejected) return "reported_rejected";
      return "ambiguous";
    }
    if (rejected) return "reported_rejected";
    if (approved) return "reported_satisfied";
    return null;
  }

  if (/\b(?:client|customer|reply|response)\b/u.test(requirement)) {
    const responded = hasConditionStateMatch(source, /\b(?:client|customer)\s+(?:(?:has|have)\s+)?(?:responded|replied|confirmed|got\s+back|declined|rejected)\b|\b(?:response|reply)\s+(?:was\s+)?received\b|\b(?:responded|replied|confirmed|got\s+back)\s+by\s+(?:the\s+)?(?:client|customer)\b/iu);
    return responded ? "reported_satisfied" : null;
  }

  return null;
}

export function hasExplicitConditionOverride(body) {
  return /\b(?:correction|retraction|revoked|revokes|withdrew|withdrawn|rescinded|rescinds|reversed|overturned|no\s+longer\s+approved|approval\s+(?:(?:is|was|has\s+been|has)\s+)?(?:no\s+longer\s+valid|withdrawn|revoked|rescinded|reversed)|(?:withdrawn|revoked|rescinded|reversed)\s+approval|changed\s+(?:its|the)\s+(?:approval|decision))\b/iu.test(String(body ?? ""));
}

export function resolveConditionAcrossConversation(records, precondition) {
  const evidence = records
    .filter((record) => record.startOffset > precondition.record.startOffset)
    .map((record) => {
      const body = recordMeta(record).body;
      return {
        record,
        status: conditionEvidenceStatus(body, precondition.condition),
        body,
        explicitOverride: hasExplicitConditionOverride(body),
      };
    })
    .filter((item) => item.status)
    .sort((left, right) => left.record.startOffset - right.record.startOffset);

  if (!evidence.length) {
    return { status: "pending_verification", evidence: [] };
  }

  const states = new Set(evidence.map((item) => item.status));
  if (states.has("ambiguous")) {
    return { status: "ambiguous", evidence };
  }

  if (states.has("reported_satisfied") && states.has("reported_rejected")) {
    const latest = evidence[evidence.length - 1];
    // A clearly marked correction/revocation supersedes the earlier state.
    // A merely later contradictory statement remains ambiguous.
    if (latest.explicitOverride) {
      return { status: latest.status, evidence };
    }
    return { status: "ambiguous", evidence };
  }

  return { status: states.has("reported_rejected") ? "reported_rejected" : "reported_satisfied", evidence };
}
