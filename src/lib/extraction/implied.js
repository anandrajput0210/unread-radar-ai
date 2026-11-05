import { REQUEST_VERB_SOURCE } from "./constants.js";
import { hasHindiNegation, isJoking } from "./hindi.js";

// Implied requests do not use an explicit request form ("please", "can you"),
// so they are reported as "possible" for human review rather than confirmed.

const DEADLINE_CUE = /\b(?:by|before|until|till|latest|asap|today|tonight|tomorrow|eod|tak|this\s+week|next\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:st|nd|rd|th))\b|[कआ]ल\s+तक/iu;
const NEED_NEGATION = /\b(?:don['’]?t|do\s+not|doesn['’]?t|does\s+not|no|not|never|without)\s+(?:really\s+)?need\b|\bno\s+need\b|\bneed(?:s)?\s+not\b/iu;

const NEED = /(?:^|[.!?;,]\s*|\b(?:also|and|plus|so|btw|ok)[,\s]+)(?:(?:we|i|you|they|the\s+client)\s+)?(?:really\s+)?(?:need|needs|needed|want|wants|require|requires)\s+(?!to\s+(?:talk|discuss|decide|know|see|think|meet)\b)(?<what>[^.!?]{3,})/iu;
const PASSIVE_NEED = /\b(?:needs?|has|have|must|should)\s+to\s+be\s+(?<what>\p{L}+(?:ed|en|n|t)\b[^.!?]*)/iu;
const FORGET = new RegExp(
  String.raw`\b(?:don['’]?t|do\s+not|never)\s+forget\s+(?:to\s+)?(?:${REQUEST_VERB_SOURCE})\b|\b(?:remember|make\s+sure\s+(?:you|we|to)|be\s+sure\s+to)\s+(?:to\s+)?(?:${REQUEST_VERB_SOURCE})\b`,
  "iu",
);
const BARE_WILL = new RegExp(
  String.raw`^(?:(?:ok|okay|sure|yes|yeah|alright|and|also|haan)[,.!\s]+)*(?:will|gonna|let\s+me)\s+(?:${REQUEST_VERB_SOURCE})\b`,
  "iu",
);
const CHAHIYE = /\b(?:chahiye|chahiyein|chahie|chaiye|zaroorat|zarurat)\b/iu;
const URGENT_HINDI_CUE = /\b(?:by|before|tak|today|tomorrow|kal|aaj|jaldi|urgent|abhi|asap|eod|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu;

const clean = (s) => s.replace(/\s+/g, " ").trim().replace(/[.!?]+$/u, "");

/**
 * Returns a candidate with outcome "possible", or null.
 * Never invents an owner: only a subject-less "will ..." is attributed to the speaker.
 */
export function extractImpliedRequest(body, speaker) {
  const value = String(body ?? "").trim();
  if (!value || isJoking(value) || hasHindiNegation(value)) return null;

  if (!NEED_NEGATION.test(value)) {
    const need = value.match(NEED);
    if (need && DEADLINE_CUE.test(need.groups.what)) {
      return implied(value, null, "unassigned_request", "States a need with a deadline, but no one is asked to do it");
    }
    const passive = value.match(PASSIVE_NEED);
    if (passive && DEADLINE_CUE.test(value)) {
      return implied(value, null, "unassigned_request", "Says something has to be done by a time, without a request");
    }
  }
  if (FORGET.test(value) && !/\b(?:don['’]?t|do\s+not)\s+forget\s+(?:your|my|the)\s+\p{L}+\s*(?:lol|haha)?[.!]*$/iu.test(value)) {
    return implied(value, null, "unassigned_request", "Reminder phrasing (\"don't forget to…\")");
  }
  if (CHAHIYE.test(value) && URGENT_HINDI_CUE.test(value)) {
    return implied(value, null, "unassigned_request", "Hinglish need (\"chahiye\") with a time cue");
  }
  if (BARE_WILL.test(value) && speaker) {
    return implied(value, speaker, "self_commitment", "Commitment with no stated subject (\"will …\")");
  }
  return null;
}

function implied(text, owner, classification, reason) {
  return { text: clean(text), owner, classification, origin: "implied", outcome: "possible", outcomeReason: reason };
}
