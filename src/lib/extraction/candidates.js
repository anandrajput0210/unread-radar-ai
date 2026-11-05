import { ACTION_LABEL_REGEX, COMMITMENT_REGEX, HANDLE_SOURCE, IMPERATIVE_REGEX, MODAL_DIRECTIVE_REGEX, NON_NAME_WORDS, PERSON_NAME_SOURCE, RELAY_ACTION_HINT, REQUEST_REGEX, REQUEST_VERB_SOURCE, RESERVED_SPEAKERS, TASK_VERB_SOURCE } from "./constants.js";
import { devanagariAddressee, hasHindiAction, hasHindiNegation, isBareCommitment, isJoking, matchHindiCommitment } from "./hindi.js";
import { hasUnnegatedPattern, isNegatedAt } from "./text.js";

export function trimActionPhrase(body, startIndex) {
  const rest = body.slice(startIndex).trim();
  if (!rest) return "";
  const boundary = /[?!](?=\s|$)|\.(?=\s+[A-Z\p{Lu}]|\s*$)/u.exec(rest);
  return (boundary ? rest.slice(0, boundary.index) : rest)
    .replace(/[\s.!?;,:-]+$/u, "")
    .trim();
}

export function directAddressActions(body) {
  const actions = [];
  const regex = new RegExp(
    String.raw`(?:^|[.!?]\s+|,\s*)(${PERSON_NAME_SOURCE})\s*,\s*(?:(?:please\s+(?:also\s+)?)|(?:(?:can|could|would|will)\s+you\s+))?(${REQUEST_VERB_SOURCE})\b`,
    "giu",
  );
  let match;
  while ((match = regex.exec(body)) !== null) {
    const owner = match[1].trim();
    const verbIndex = match.index + match[0].lastIndexOf(match[2]);
    const actionText = trimActionPhrase(body, verbIndex);
    const groupAddress = /^(?:team|everyone|all|folks|guys)$/iu.test(owner.replace(/^@/, ""));
    const invalidAddress = RESERVED_SPEAKERS.has(owner.toLocaleLowerCase());
    if (actionText && !invalidAddress) actions.push({ text: actionText, owner: groupAddress ? null : owner, classification: groupAddress ? "unassigned_action" : "assigned_task" });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return actions;
}

export function extractBulletAssignments(body) {
  const candidates = [];
  const segments = String(body ?? "").split(/\s*(?:\/|;|\n|\|)\s*/u).filter(Boolean);
  const assignmentRegex = new RegExp(
    String.raw`^(${PERSON_NAME_SOURCE})\s+to\s+(${TASK_VERB_SOURCE})\b([\s\S]*)$`,
    "iu",
  );
  for (const segment of segments) {
    const match = segment.trim().match(assignmentRegex);
    if (!match) continue;
    const owner = match[1].trim();
    const actionText = `${match[2]}${match[3] || ""}`.trim().replace(/[.!?]+$/u, "");
    // "We need to finalize..." / "If we need to..." read as "Name to verb" but name no person.
    const notAName = /^(?:we|if|do|does|did|they|you|i|it|who|what|then|and|so|also|when|how|why|should|would|could|might|may|can|will)\b|\b(?:need|needs|needed|have|has|had|want|wants|got|going)$/iu.test(owner);
    if (actionText && !notAName && !RESERVED_SPEAKERS.has(owner.toLocaleLowerCase())) {
      candidates.push({ text: actionText, owner, classification: "assigned_task" });
    }
  }
  return candidates;
}

export function extractHinglishAction(body) {
  const value = String(body ?? "").trim();
  if (!hasHindiAction(value) || hasHindiNegation(value)) return null;
  if (isJoking(value)) return null;
  const cleaned = value.replace(/^(?:bhai|yaar|bro|please|plz)[,!:;\s]+/iu, "").trim();
  if (!cleaned) return null;
  // "Vikram bhai, kal tak invoice bhej dena" addresses Vikram. A capitalised
  // name followed by a comma is an explicit addressee; generic salutations are not.
  const addressed = cleaned.match(/^(?<name>\p{Lu}[\p{L}\p{M}'’.-]*)(?:\s+(?:bhai|bhaiya|ji|sir|madam|didi|yaar))?\s*,\s*(?<rest>[\s\S]+)$/u);
  const name = addressed?.groups?.name;
  if (name && !NON_NAME_WORDS.has(name.toLocaleLowerCase()) && !RESERVED_SPEAKERS.has(name.toLocaleLowerCase())) {
    const rest = addressed.groups.rest.trim();
    if (rest) return { text: rest, owner: name, classification: "assigned_task", origin: "hinglish_rule" };
  }
  const deva = devanagariAddressee(cleaned);
  if (deva?.rest) return { text: deva.rest.replace(/[।.!?]+$/u, ""), owner: deva.name, classification: "assigned_task", origin: "hinglish_rule" };
  return { text: cleaned.replace(/[।]+$/u, ""), owner: null, classification: "unassigned_action", origin: "hinglish_rule" };
}

/** "Banner ka kaam ab Rohan karega": names who now does the work. */
export function extractHindiAssignment(body) {
  const match = String(body ?? "").match(/^(?<task>.{3,}?)\s+ab\s+(?<owner>\p{Lu}[\p{L}\p{M}'’.-]*)\s+(?:karega|karegi|dekhega|dekhegi|sambhalega|sambhalegi|handle\s+karega)\b/iu);
  if (!match) return null;
  const owner = match.groups.owner;
  if (NON_NAME_WORDS.has(owner.toLocaleLowerCase()) || RESERVED_SPEAKERS.has(owner.toLocaleLowerCase())) return null;
  return { text: match.groups.task.trim(), owner, classification: "assigned_task", origin: "hinglish_assignment" };
}

/** "haan bhai, kar dunga" / "कर दूंगा": first-person Hinglish or Hindi commitment by the speaker. */
export function extractHindiCommitment(body, speaker) {
  const value = String(body ?? "").trim();
  if (!speaker || isJoking(value) || hasHindiNegation(value)) return null;
  const match = matchHindiCommitment(value);
  if (!match) return null;
  const text = value.replace(/^(?:(?:haan|han|ha|ok|okay|ji|bhai|bhaiya|sir|madam|theek\s+hai|thik\s+hai|ठीक\s+है|हाँ|हां)[,.!\s]+)+/iu, "").replace(/[।.!?]+$/u, "").trim();
  return { text: text || value, owner: speaker, classification: "self_commitment", origin: "self_commitment", bare: isBareCommitment(value, match) };
}

/** "Neha ko bol do presentation complete kare": Neha is the one who must act. */
export function extractRelayAction(body) {
  const match = String(body ?? "").match(/(?:^|[.!?]\s+)(?<name>\p{Lu}[\p{L}\p{M}'’.-]*)\s+ko\s+(?:bol\s+do|bolo|bol\s+dena|bolna|keh\s+do|kehna|keh\s+dena)\s+(?:ki\s+)?(?<rest>[^.!?\n]+)/u);
  if (!match) return null;
  const name = match.groups.name;
  const rest = match.groups.rest.trim();
  if (NON_NAME_WORDS.has(name.toLocaleLowerCase()) || RESERVED_SPEAKERS.has(name.toLocaleLowerCase())) return null;
  // Telling someone a fact ("Rahul ko bol do meeting kal hai") is not a task.
  if (!rest || !RELAY_ACTION_HINT.test(rest)) return null;
  return { text: rest, owner: name, classification: "assigned_task", origin: "hinglish_relay" };
}

export function extractOverdueFollowup(body) {
  const pattern = new RegExp(
    String.raw`^(?:(?<owner>${PERSON_NAME_SOURCE})\s+)?(?:you|u)\s+(?:were|was)\s+supposed\s+to\s+(?<action>(?:${TASK_VERB_SOURCE})\b[\s\S]*)$`,
    "iu",
  );
  const match = String(body ?? "").trim().match(pattern);
  if (!match?.groups?.action) return null;
  const actionText = match.groups.action
    .replace(/,\s*(?:still waiting|still pending|waiting for (?:the )?reply|following up|just following up)[\s\S]*$/iu, "")
    .replace(/\s+\b(?:yesterday|today|tomorrow|aaj|kal\s+tak)\b[\s\S]*$/iu, "")
    .trim()
    .replace(/[.!?]+$/u, "");
  return {
    text: actionText,
    owner: match.groups.owner?.trim() || null,
    classification: match.groups.owner ? "assigned_task" : "unassigned_request",
    origin: "overdue_followup",
  };
}

export function extractSelfCommitment(body, speaker) {
  const matches = [...body.matchAll(new RegExp(COMMITMENT_REGEX.source, "giu"))]
    .filter((match) => !isNegatedAt(body, match.index));
  if (!matches.length || /^\s*(?:decision:|agreed\s+decision:)/iu.test(body)) return null;
  const first = matches[0];
  const pronoun = first.groups?.pronoun || first[1];
  const verb = first.groups?.verb || first[2];
  const verbIndex = first.index + first[0].lastIndexOf(verb);
  const actionText = body.slice(verbIndex).replace(/[\s.!?;,:-]+$/u, "").trim();
  if (!actionText) return null;
  const isIndividual = pronoun.toLocaleLowerCase() === "i";
  return {
    text: actionText,
    owner: isIndividual ? (speaker || null) : null,
    classification: isIndividual && speaker ? "self_commitment" : "unassigned_action",
    origin: "self_commitment",
  };
}

export function inferAssignee(line) {
  const explicitOwner = line.match(
    new RegExp(
      String.raw`\b(?:assigned\s+to|assign\s+to|owner|assignee|task\s+for)\s*[:=]?\s*(@?${HANDLE_SOURCE})`,
      "iu"
    )
  );
  if (explicitOwner) return explicitOwner[1];
  const directRequest = line.match(
    new RegExp(
      String.raw`(?:^|[^\p{L}\p{N}._%+-])@(${HANDLE_SOURCE})(?:\s*:\s*|\s+)(?:(?:please|can you|could you|to)\s+)?(?:${TASK_VERB_SOURCE})\b`,
      "iu"
    )
  );
  return directRequest ? `@${directRequest[1]}` : null;
}

export function hasActionDirective(line) {
  const labelMatch = ACTION_LABEL_REGEX.exec(line);
  if (labelMatch) {
    const content = labelMatch[1].trim();
    const isNegatedAction = /^(?:no\b|not\b|never\b|don't\b|don’t\b|do not\b|does not\b|is not\b|isn't\b|isn’t\b)/i.test(content);
    return content.length > 0 && !isNegatedAction;
  }
  if (extractSelfCommitment(line, null)) return true;
  const patterns = [REQUEST_REGEX, MODAL_DIRECTIVE_REGEX, IMPERATIVE_REGEX];
  return patterns.some((pattern) => hasUnnegatedPattern(line, pattern));
}

export function taskClassificationFor(body, candidate) {
  if (candidate.classification) return candidate.classification;
  if (candidate.owner) return "assigned_task";
  if (/\b(?:can|could|would)\s+(?:you|someone|anyone|somebody)\b/iu.test(body)) return "unassigned_request";
  return "unassigned_action";
}
