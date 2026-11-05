/**
 * Review-queue extraction: "don't guess" outcomes.
 *
 * The confirmed-task extractor is deliberately conservative (closed verb list,
 * explicit request forms). This module looks at the messages it did NOT turn
 * into tasks and flags those that carry a general request/commitment *frame*
 * without requiring a known verb. Results are never tasks by themselves:
 *
 *   extractionState "possible"             - a commitment/request seems present; a human should confirm
 *   extractionState "insufficient_context" - a commitment seems present but what/who is missing
 *
 * "Not a task" is simply absence from both lists. Every item keeps its exact
 * source span, the reason it was flagged, and which fields are missing.
 */
import { hasDecisionSignal } from "./actions.js";
import { PERSON_NAME_SOURCE, RESERVED_SPEAKERS } from "./constants.js";
import { resolveDeadlineDate } from "./dates.js";
import { conversationMessageRecords, recordMeta, resolveParseOptions } from "./records.js";
import { sourceSpan, urgencyFor } from "./text.js";
import { extractDueSignal } from "./timing.js";

// Word-boundary that also works for Devanagari (JS \b does not).
const B_START = String.raw`(?<![\p{L}\p{M}\p{N}_])`;
const B_END = String.raw`(?![\p{L}\p{M}\p{N}_])`;
const word = (source) => new RegExp(`${B_START}(?:${source})${B_END}`, "iu");

const WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday|somvar|mangalvar|budhvar|guruvar|shukravar|shanivar|ravivar|सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार";
const TIME_CUE = word(String.raw`by|before|till|until|tak|today|tonight|tomorrow|eod|eow|asap|urgent|jaldi|kal|aaj|parso|abhi|weekend|deadline|due|तक|आज|कल|परसों|अभी|जल्दी|\d{1,2}(?:st|nd|rd|th)|${WEEKDAYS}`);
const DELIVERABLE = word(String.raw`report|invoice|quote|quotation|file|files|design|designs|logo|deck|sheet|document|doc|pdf|update|numbers|draft|proposal|contract|payment|brochure|photos?|samples?|copy|plan|budget|estimate|timeline|screenshots?|source|access|approval|refund|callback|ticket|letter|agenda|slides?|website|page|banner|video|list|rinvoice|रिपोर्ट|इनवॉइस|कोटेशन|डिज़ाइन|डिजाइन|फ़ाइल|फाइल|भुगतान|पेमेंट`);

const ACK_ONLY = /^\s*(?:ok(?:ay)?|okk+|sure|yes|yep|haan|ha|ji|jee|noted|got\s+it|done|will\s+do|on\s+it|theek\s+hai|thik\s+hai|cool|great|thanks?|thank\s+you|perfect|nice|good|ठीक\s+है|जी|ओके|धन्यवाद|[\p{Extended_Pictographic}\p{P}\s])+$/iu;

const NEGATED_NEED = /\b(?:don['’]?t|do\s+not|doesn['’]?t|no)\s+need\b|\bno\s+rush\b|\bnot\s+(?:needed|required|necessary)\b|\bnahi?n?\s+chahiye\b|नहीं\s+चाहिए|\bno\s+hurry\b/iu;
const NEGATED_ACTION = /(?:^|[^\p{L}])(?:mat|nahi|nahin|na|मत|नहीं)\s+\p{L}+|\b(?:don['’]?t|do\s+not|never|shouldn['’]?t|should\s+not|won['’]?t)\b/iu;
// Negation inside the request clause itself (after the request cue, or swallowed by it).
const PROHIBITION = /(?<![\p{L}\p{M}])(?:not|never|don['’]?t|do\s+not|dont|mat|nahi|nahin|मत|नहीं)(?![\p{L}\p{M}])|\bno\s+need\b|\bhold\s+off\b|\bstop\b|\bskip\b|\bavoid\b/iu;
const PERSONAL_NEED = /\b(?:I|i)\s+(?:need|want)\s+(?:a|an|some|to\s+(?:sleep|rest|eat|go|leave|run))\b/u;

const NAME_BEFORE = new RegExp(String.raw`(?:^|[.!?]\s+|,\s*|\band\s+)(${PERSON_NAME_SOURCE})\s*,?\s*$`, "u");

function addressedName(body, index) {
  const prefix = body.slice(0, index);
  const m = prefix.match(NAME_BEFORE);
  if (!m) return null;
  const name = m[1].replace(/^@/u, "").trim();
  const first = name.split(/\s+/u)[0];
  if (!name || RESERVED_SPEAKERS.has(name.toLocaleLowerCase())) return null;
  if (/^(?:and|also|so|ok|okay|hi|hey|hello|team|everyone|all|guys|folks|sir|bhai|yaar|please|pls|can|could|would|will|the|a|an|i|we|you|it|this|that|then|but|now)$/iu.test(first)) return null;
  return name;
}

// Each frame: { reason, label, re, owner(ctx) -> name|null, who: "speaker"|"addressee"|"none", skipNegated, needsCue }
const FRAMES = [
  {
    reason: "reminder", label: "Reminder or must-do wording", skipNegated: false,
    re: word(String.raw`don['’]?t\s+forget|do\s+not\s+forget|remember\s+to|make\s+sure|reminder\s*[:\-]?|yaad\s+(?:se|rakhna|dilana|dila\s+dena)|bhoolna\s+mat|भूलना\s+मत|याद\s+(?:दिला|रखना)`),
  },
  {
    reason: "polite-request", label: "Polite request (please / pls / kindly)", skipNegated: true,
    re: word(String.raw`please|pls|plz|kindly|कृपया`), minWordsAfter: 2,
  },
  {
    reason: "question-request", label: "Request phrased as a question", skipNegated: true,
    re: word(String.raw`(?:can|could|would|will)\s+(?:you|u)\s+(?:also\s+|please\s+|just\s+|kindly\s+)?\p{L}+|(?:can|could|would)\s+(?:someone|anyone|somebody)\s+\p{L}+`),
    exclude: /\b(?:hear|see)\s+me\b/iu,
  },
  {
    reason: "hinglish-request", label: "Hindi/Hinglish request form", skipNegated: true,
    re: word(String.raw`(?:kar|de|le|bhej|bata|dekh|check|share|send|update|book|bana|mangwa|pahuncha|approve|file|reply|remind)\s*(?:do|dena|dijiye|dijiyega|lena|lijiye|lo|dedo|kardo)|\p{L}+\s+(?:karna|bhejna|dena|bhijwana|banana)\s+(?:hai|h)|(?:कर|भेज|दे|देख|बता|दिला)\s*(?:देना|दो|दीजिए|दीजिये|लेना|लो|दें)|\p{L}+\s+करना\s+है|jaldi\s+aana|जल्दी\s+आना`),
  },
  {
    reason: "implied-need", label: "Need / want statement (implied request)", skipNegated: false, needsCue: true,
    re: word(String.raw`need|needs|needed|want|wants|wanted|require|requires|required|expecting|chahiye|chahie|chaahiye|चाहिए`),
    exclude: NEGATED_NEED, excludeBody: PERSONAL_NEED,
  },
  {
    reason: "obligation", label: "Obligation with a time cue", skipNegated: true, needsCue: true,
    re: word(String.raw`needs?\s+to|has\s+to|have\s+to|must|should|supposed\s+to`),
    exclude: NEGATED_NEED,
  },
  {
    reason: "unassigned-action", label: "Someone is expected to act", skipNegated: true,
    re: word(String.raw`(?:someone|somebody|anyone)\s+(?:needs?\s+to|has\s+to|should|must)\s+\p{L}+`),
  },
  {
    reason: "pending-followup", label: "Waiting on / pending item", skipNegated: false,
    re: word(String.raw`still\s+waiting|waiting\s+(?:for|on)|awaiting|yet\s+to\s+(?:receive|get)|not\s+(?:yet\s+)?(?:received|here|ready)|(?:is|are)\s+(?:still\s+)?pending|pending\s+(?:hai|h|from)|abhi\s+tak\s+nahi?n?\s+\p{L}+|nahi?n?\s+aaya|baaki\s+hai|अभी\s+तक\s+नहीं|इंतज़ार`),
  },
  {
    reason: "self-commitment", label: "First-person commitment", skipNegated: true, who: "speaker", commitment: true,
    re: word(String.raw`(?:I|we)(?:['’]ll|\s+will|\s+shall)\s+\p{L}+|(?:dunga|dungi|denge|lunga|lungi|karunga|karungi|bhejunga|bhejungi|aunga|aungi|launga|laungi|dekhunga|dekhungi|दूंगा|दूँगा|दूंगी|दूँगी|करूंगा|करूँगा|करूंगी|करूँगी|लूंगा|लूँगा|लूंगी|लूँगी|भेजूंगा|भेजूंगी|आऊंगी|आऊँगी|आऊंगा|आऊँगा)`),
  },
];

const COMMITMENT_FILLER = word(String.raw`i|we|will|ll|shall|main|mai|hum|ham|dunga|dungi|denge|lunga|lungi|karunga|karungi|bhej|kar|de|le|ok|okay|sure|yes|ji|haan|pakka|to|at|in|on|the|a|an|it|and|aur|ko|ka|ki|ke|se|है|मैं|हम|ठीक|और|को|का|की|के|से|${WEEKDAYS}|today|tonight|tomorrow|kal|aaj|parso|subah|shaam|raat|tak|by|jaldi|कल|आज|तक|शाम|सुबह|रात`);

function objectTokens(body) {
  return body
    .replace(/['’]ll\b/giu, " ")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((token) => token && !COMMITMENT_FILLER.test(token) && !/^\d+$/u.test(token));
}

function wordCount(text) {
  return text.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).length;
}

function frameMatch(frame, body) {
  const match = frame.re.exec(body);
  if (!match) return null;
  if (frame.exclude?.test(body)) return null;
  if (frame.excludeBody?.test(body)) return null;
  if (frame.needsCue && !TIME_CUE.test(body) && !DELIVERABLE.test(body)) return null;
  if (frame.minWordsAfter && wordCount(body.slice(match.index + match[0].length)) < frame.minWordsAfter) return null;
  // A prohibition is never a request, wherever the negation sits: "please don't send",
  // "could you not update", "report mat bhejna", "रिपोर्ट मत भेजना".
  if (frame.skipNegated && !frame.commitment) {
    const clauseAfter = body.slice(match.index + match[0].length).split(/[.!?;\n]/u)[0];
    if (PROHIBITION.test(match[0]) || PROHIBITION.test(clauseAfter)) return null;
  }
  if (frame.skipNegated) {
    const before = body.slice(Math.max(0, match.index - 40), match.index + match[0].length);
    if (NEGATED_ACTION.test(before) && !frame.commitment) return null;
    if (frame.commitment && /\b(?:don['’]?t|do\s+not|won['’]?t|never|mat|nahi?n?)\b|मत|नहीं/iu.test(before)) return null;
  }
  return match;
}

/**
 * @param text raw chat text
 * @param options same parse options as extractActions
 * @param confirmedActions actions already extracted as confirmed tasks (their messages are skipped)
 */
export function extractReviewQueue(text, options = {}, confirmedActions = []) {
  options = resolveParseOptions(text, options);
  const records = conversationMessageRecords(text, options).filter((record) => record.text);
  const confirmedStarts = new Set(confirmedActions.map((action) => action.sourceSpan?.startOffset));
  const producedBy = new Map(); // record index -> speaker, for tasks and queue items
  const queue = [];

  records.forEach((record, index) => {
    if (confirmedStarts.has(record.startOffset)) {
      producedBy.set(index, recordMeta(record, options).speaker ?? null);
      return;
    }
    const meta = recordMeta(record, options);
    const speaker = meta.speaker ?? null;
    const body = String(meta.body ?? record.text).trim();
    if (!body || ACK_ONLY.test(body) || hasDecisionSignal(body) || meta.forwarded) return;

    for (const frame of FRAMES) {
      const match = frameMatch(frame, body);
      if (!match) continue;

      // A commitment right after someone else's request/task is an
      // acknowledgement of that item, not a new commitment.
      if (frame.commitment) {
        const answeringRequest = [index - 1, index - 2].some((i) => i >= 0 && producedBy.has(i) && producedBy.get(i) !== speaker);
        if (answeringRequest) break;
      }

      let state = "possible";
      const missing = [];
      let owner = null;
      if (frame.who === "speaker") owner = speaker;
      else if (/question-request|polite-request|hinglish-request/u.test(frame.reason)) owner = addressedName(body, match.index);
      if (frame.reason === "pending-followup") {
        const from = body.match(new RegExp(String.raw`(?:from|by)\s+(${PERSON_NAME_SOURCE})`, "u"));
        if (from) owner = from[1].replace(/^@/u, "").split(/\s+/u)[0];
      }
      if (frame.commitment && objectTokens(body).length === 0) {
        state = "insufficient_context";
        missing.push("what");
      }
      if (!owner) missing.push("owner");
      const dueDate = extractDueSignal(body, { allowCommitmentTiming: true });
      if (!dueDate) missing.push("deadline");

      queue.push({
        id: `queue-${record.ordinal}-${frame.reason}`,
        text: body.length > 220 ? `${body.slice(0, 217)}…` : body,
        sourceText: record.rawText || record.text,
        owner,
        requestedBy: frame.commitment ? null : speaker,
        extractionState: state,
        reason: frame.reason,
        reasonLabel: frame.label,
        missing,
        dueDate,
        resolvedDueDate: dueDate ? resolveDeadlineDate(dueDate, meta.timestamp?.date || null, options) : null,
        urgency: urgencyFor(body),
        sourceSpan: sourceSpan(record),
      });
      producedBy.set(index, speaker);
      break;
    }
  });
  return queue;
}
