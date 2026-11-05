import { REQUEST_VERB_SOURCE } from "./constants.js";
import { hasHindiNegation, isJoking } from "./hindi.js";

/**
 * Collective statements: "we need to finalize the roadmap", "let's complete the
 * deployment", "humein report bhejna hai".
 *
 * Not every "we need to" is a task. Each sentence is sorted into one of:
 *   obligation  we need to / have to / must + action  -> confirmed task, no owner
 *   proposal    we should / let's + action            -> possible task (a suggestion)
 *   skip        hypothetical, question, decision, negation, past tense, "need to decide"
 * A collective statement never invents an owner.
 */

const VOCATIVE = /^\s*(?:(?:hey|hi|ok|okay|so|also|and|btw)[,\s]+)*(?:(?:guys|team|folks|everyone|everybody|all|people|friends|gang|colleagues)\b[,:\s-]*)?/iu;
const WE = String.raw`(?:we|we\s+all|all\s+of\s+us|us)`;
const ACTION = String.raw`(?:${REQUEST_VERB_SOURCE}|push|get\s+\S+(?:\s+\S+){0,6}?\s+(?:signed|done|approved|finished|ready|completed|reviewed|sent|submitted|fixed))`;

const OBLIGATION = new RegExp(String.raw`\b${WE}\s+(?:(?:really|all|now|also|still|just)\s+)*(?:need\s+to|needs\s+to|have\s+to|has\s+to|must|got\s+to|gotta)\s+(?<action>${ACTION})\b(?<rest>[^.!?;]*)`, "iu");
const PROPOSAL_WE = new RegExp(String.raw`\b${WE}\s+(?:(?:probably|really|also|maybe|perhaps)\s+)*should\s+(?!not\b|n['’]t\b)(?:(?:probably|really|also|maybe|perhaps|just)\s+)*(?<action>${ACTION})\b(?<rest>[^.!?;]*)`, "iu");
const PROPOSAL_LETS = new RegExp(String.raw`(?:^|[,:;]\s*|\b(?:ok|okay|so|and)\s+)let['’]?s\s+(?:(?:all|please|also|just)\s+)*(?<action>${ACTION})\b(?<rest>[^.!?;]*)`, "iu");

const HYPOTHETICAL = /\b(?:if|what\s+if|suppose|supposing|in\s+case|whether|unless)\b[^.!?]*\b(?:we|us)\b|\bwe\s+(?:might|may|could|would|can\s+maybe)\s+(?:need|have)\s+to\b|\bwe['’]d\s+(?:need|have)\s+to\b|\bthen\s+we\s+(?:would|will)\s+need\b/iu;
const DECISION = /\bwe(?:['’]ve|\s+have)?\s+(?:decided|agreed|concluded|resolved|settled|confirmed)\b|\b(?:decided|agreed)\s+(?:to|on)\b/iu;
const NEGATED = /\b(?:we\s+)?(?:don['’]?t|do\s+not|didn['’]?t|did\s+not|won['’]?t|will\s+not|no\s+longer|never)\s+(?:really\s+)?(?:need|have)\s+to\b|\bno\s+need\s+to\b|\bneedn['’]?t\b|\bneed\s+not\b|\bnot\s+needed\b/iu;
const PAST = /\bwe\s+(?:had\s+to|needed\s+to|have\s+already|['’]ve\s+already|already|just\s+finished|finally)\b|\bwe['’]ve\s+(?:already|just)\b|\bit['’]s\s+(?:done|finished)\s+now\b/iu;
const NON_ACTION_NEED = /\b(?:need|needs|have|has)\s+to\s+(?:decide|discuss|talk|know|see|think|meet|figure\s+out|understand|consider|agree|align|brainstorm|chat|sync)\b/iu;
const QUESTION = /\?\s*$/u;

// Hinglish / Hindi collective obligations.
const HI_COLLECTIVE = /(?:^|[^\p{L}])(?:humein|hamein|hume|humko|hamko|hum\s+sabko|sabko|हमें|हमको|हम\s+सबको)(?![\p{L}\p{M}])[^.!?]*?(?:karna|karni|karne|bhejna|banana|dena|lena|jama\s+karna|करना|करनी|भेजना|बनाना|देना|लेना)\s*(?:hai|padega|padegi|hoga|chahiye|है|पड़ेगा|होगा|चाहिए)/iu;
const HI_OBLIGATION_NO_SUBJECT = /(?:karna|karni|bhejna|banana|file\s+karna|करना|भेजना)\s+(?:padega|padegi|hoga|पड़ेगा|होगा)(?![\p{L}\p{M}])/iu;
const HI_TIME = /\b(?:tak|kal|aaj|parso|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|(?:कल|आज|परसों)\s+तक/iu;

const clean = (s) => String(s).replace(/\s+/g, " ").trim().replace(/[.!?]+$/u, "");
const sentences = (body) => String(body).split(/(?<=[.!?])\s+|\n+/u).map((s) => s.trim()).filter(Boolean);

/** Why a collective-sounding sentence is NOT a task, or null when it is not excluded. */
export function collectiveExclusion(sentence) {
  const s = sentence.replace(VOCATIVE, "");
  if (!/\b(?:we|us|let['’]?s)\b|humein|hamein|hume|हमें/iu.test(s)) return null;
  if (!/\b(?:need|needs|have\s+to|has\s+to|must|should|let['’]?s|got\s+to|gotta|decided|agreed|had\s+to|needed)\b|humein|hamein|hume|हमें/iu.test(s)) return null;
  if (QUESTION.test(s)) return "question";
  if (HYPOTHETICAL.test(s)) return "hypothetical";
  if (NEGATED.test(s)) return "negated";
  if (DECISION.test(s)) return "decision";
  if (PAST.test(s)) return "past";
  if (NON_ACTION_NEED.test(s)) return "non-action";
  return null;
}

/**
 * Returns { candidate } for a collective task/proposal, { skip: true } when the
 * message is only an excluded collective statement, or null when this module has
 * nothing to say (so the other extractors run unchanged).
 */
export function extractCollective(body) {
  const text = String(body ?? "").trim();
  if (!text || isJoking(text)) return null;
  const parts = sentences(text);
  let excluded = 0;
  for (const raw of parts) {
    const sentence = raw.replace(VOCATIVE, "");
    if (collectiveExclusion(raw)) { excluded += 1; continue; }

    const ob = sentence.match(OBLIGATION);
    if (ob) return { candidate: make(ob, "obligation", raw) };
    const lets = sentence.match(PROPOSAL_LETS);
    const addressedToTeam = VOCATIVE.exec(raw)?.[0].trim().length > 0 && /\b(?:guys|team|folks|everyone|everybody|all|people|gang|colleagues)\b/iu.test(VOCATIVE.exec(raw)[0]);
    if (lets) {
      const deadline = /\b(?:by|before|until|till|today|tonight|tomorrow|eod|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week)\b/iu.test(lets.groups.rest);
      return { candidate: make(lets, addressedToTeam || deadline ? "obligation" : "proposal", raw, "let's") };
    }
    const should = sentence.match(PROPOSAL_WE);
    if (should) return { candidate: make(should, "proposal", raw, "we should") };

    if (!hasHindiNegation(sentence)) {
      if (HI_COLLECTIVE.test(sentence)) return { candidate: hindi(raw, "obligation") };
      if (HI_OBLIGATION_NO_SUBJECT.test(sentence) && HI_TIME.test(sentence)) return { candidate: hindi(raw, "proposal") };
    }
  }
  if (excluded > 0 && excluded === parts.length) return { skip: true };
  return null;
}

function make(match, kind, sentence, cue = "") {
  const action = clean(`${match.groups.action}${match.groups.rest ?? ""}`);
  return {
    text: action,
    owner: null,
    classification: "collective_task",
    origin: "collective",
    ...(kind === "proposal"
      ? { outcome: "possible", outcomeReason: `Proposal ("${cue}…"), not a commitment` }
      : {}),
    sentence,
  };
}

function hindi(sentence, kind) {
  return {
    text: clean(sentence),
    owner: null,
    classification: "collective_task",
    origin: "collective",
    ...(kind === "proposal"
      ? { outcome: "possible", outcomeReason: "States an obligation with a time but names no owner" }
      : {}),
    sentence,
  };
}
