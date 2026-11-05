import { RELATION_STOP_WORDS, TASK_VERB_SET } from "./constants.js";
import { sourceSpan } from "./text.js";

export function matchesAcknowledgement(body) {
  return /^\s*(?:(?:sure|yes|yep|ok(?:ay)?|alright|absolutely)[,!\s]+)?(?:i['’]?m\s+on\s+it|i\s+am\s+on\s+it|on\s+it|will\s+do|i['’]?ll\s+(?:do\s+it|take\s+it)|got\s+it|consider\s+it\s+done|i\s+can\s+handle\s+that)[.!\s]*$/iu.test(body)
    // Hinglish: "Ok sir, kar deta hu", "ho jayega", "kar dunga". A bare "ok" is NOT an acknowledgement.
    || /^\s*(?:(?:ok(?:ay)?|theek\s+hai|thik\s+hai|haan|ji|yes)[,\s]+)*(?:(?:sir|boss|bhai|ji)[,\s]+)?(?:kar\s+(?:deta|dunga|dungi|deti|denge)(?:\s+(?:hu|hoon|hun))?|ho\s+(?:jayega|jaega|jaayega)|kar\s+dun(?:ga|gi)|karta\s+(?:hu|hoon|hun)|kar\s+raha\s+(?:hu|hoon|hun)|kar\s+leta\s+(?:hu|hoon|hun))[.!\s]*$/iu.test(body);
}

export function ownerMatchesSpeaker(owner, speaker) {
  if (!owner || !speaker) return false;
  const ownerName = owner.replace(/^@/, "").trim().toLocaleLowerCase();
  const speakerName = speaker.trim().toLocaleLowerCase();
  if (ownerName === speakerName) return true;
  const firstOwnerToken = ownerName.split(/\s+/)[0];
  const firstSpeakerToken = speakerName.split(/\s+/)[0];
  return firstOwnerToken.length > 1 && firstOwnerToken === firstSpeakerToken;
}

export function relationTokens(text) {
  return new Set(String(text ?? "").toLocaleLowerCase()
    .replace(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/giu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token)
    .filter((token) => token.length > 2 && !RELATION_STOP_WORDS.has(token) && !TASK_VERB_SET.has(token)));
}

export function relationScore(left, right) {
  const a = relationTokens(left);
  const b = relationTokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}

export function addSupportingDetail(action, record, body, kind = "detail") {
  action.supportingDetails ||= [];
  const key = body.toLocaleLowerCase();
  if (!action.supportingDetails.some((item) => item.text.toLocaleLowerCase() === key)) {
    action.supportingDetails.push({ text: body, sourceSpan: sourceSpan(record), kind });
  }
}

export function findUniquePriorAction(actions, owner, text, record, { minimumScore = 0.28 } = {}) {
  const matches = actions
    .filter((action) => action.owner && ownerMatchesSpeaker(action.owner, owner) && action.sourceSpan.startOffset < record.startOffset)
    .map((action) => ({ action, score: relationScore(action.text, text) }))
    .filter((item) => item.score >= minimumScore)
    .sort((a, b) => b.score - a.score);
  if (!matches.length) return null;
  if (matches.length > 1 && matches[0].score - matches[1].score < 0.12) return null;
  return matches[0].action;
}
