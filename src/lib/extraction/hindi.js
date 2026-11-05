// Hinglish (Latin script) and Devanagari phrase patterns. Pattern-based only:
// this is not Hindi language understanding, and every match is still a candidate.

const L = String.raw`\p{L}\p{M}`;
const NOT_LETTER_BEFORE = String.raw`(?<![${L}])`;
const NOT_LETTER_AFTER = String.raw`(?![${L}])`;

const ACTION_VERBS_LATIN = "send|share|remind|update|check|book|forward|call|submit|follow\\s*up|confirm|pay|print|fix|prepare|finali[sz]e|schedule|arrange|upload|review|bhej|kar|de|dekh|bata";

/** Imperatives / requests: "bhej dena", "check kar lena", "bata do", "कर देना". */
export const HINGLISH_ACTION_REGEX = new RegExp(
  `${NOT_LETTER_BEFORE}(?:` +
    String.raw`bhej\s+(?:dena|do|dijiye|dijiyo|dein)|bhejna|bhejo|bhijwa\s+(?:dena|do)` +
    String.raw`|(?:kar|kr)\s+(?:dena|do|dijiye|dijiyo|dein|lena|lo)` +
    String.raw`|(?:finish|complete|submit)\s+karna` +
    String.raw`|de\s+(?:dena|do)|dekh\s+(?:lena|lo|lijiye)|bata\s+(?:dena|do|dijiye)|batao` +
    String.raw`|karke\s+(?:batao|bhejo|do)` +
  `)${NOT_LETTER_AFTER}`,
  "iu",
);

export const DEVANAGARI_ACTION_REGEX = new RegExp(
  `${NOT_LETTER_BEFORE}(?:` +
    String.raw`(?:कर|भेज|दे|देख|बता|भिजवा)\s+(?:देना|दो|दीजिए|दीजिये|लेना|लो|दें)|भेजना|करना` +
  `)${NOT_LETTER_AFTER}`,
  "u",
);

/** First-person future: "kar dunga", "bhej dungi", "कर दूंगा". */
export const HINGLISH_COMMITMENT_REGEX = new RegExp(
  `${NOT_LETTER_BEFORE}(?:` +
    String.raw`(?:${ACTION_VERBS_LATIN})\s+(?:dunga|dungi|lunga|lungi|denge|lenge)` +
    String.raw`|karunga|karungi|dekhunga|dekhungi|bhejunga|bhejungi|bataunga|bataungi` +
  `)${NOT_LETTER_AFTER}`,
  "iu",
);

export const DEVANAGARI_COMMITMENT_REGEX = new RegExp(
  `${NOT_LETTER_BEFORE}(?:` +
    String.raw`(?:कर|भेज|दे|देख|बता)\s+(?:दू[ंँ]?गा|दू[ंँ]?गी|लू[ंँ]?गा|लू[ंँ]?गी|दे[ंँ]गे|ले[ंँ]गे)` +
    String.raw`|(?:करू[ंँ]?गा|करू[ंँ]?गी|भेजू[ंँ]?गा|भेजू[ंँ]?गी)` +
  `)${NOT_LETTER_AFTER}`,
  "u",
);

/** "mat bhejna", "nahi karna", "मत भेजो": a prohibition, never a task. */
export const HINGLISH_NEGATION_REGEX = new RegExp(
  String.raw`(?:^|[^\p{L}])(?:mat|nahi|nahin|nhi|na)\s+(?:\p{L}+\s+){0,2}(?:bhej|kar|de|dekh|check|send|update|share|bata|book|call|finish|complete|submit|forward|upload)`,
  "iu",
);
export const DEVANAGARI_NEGATION_REGEX = /(?:मत|नहीं)\s+(?:\p{Script=Devanagari}+\s+){0,2}(?:भेज|कर|दे|देख|बता)/u;

const JOKING = /(?:\bhaha+\b|\blol\b|\blmao\b|\bjk\b|just\s+joking|mazak|[😂🤣]|हा+हा)/iu;

export function hasHindiNegation(text) {
  const value = String(text ?? "");
  return HINGLISH_NEGATION_REGEX.test(value) || DEVANAGARI_NEGATION_REGEX.test(value);
}

export function isJoking(text) {
  return JOKING.test(String(text ?? ""));
}

export function hasHindiAction(text) {
  const value = String(text ?? "");
  return HINGLISH_ACTION_REGEX.test(value) || DEVANAGARI_ACTION_REGEX.test(value);
}

export function matchHindiCommitment(text) {
  const value = String(text ?? "");
  return HINGLISH_COMMITMENT_REGEX.exec(value) || DEVANAGARI_COMMITMENT_REGEX.exec(value);
}

const FILLER = new RegExp(
  String.raw`(?<![\p{L}\p{M}])(?:haan|han|ha|ji|ok|okay|theek|thik|hai|bhai|bhaiya|sir|madam|ma'am|didi|yaar|main|mai|abhi|kal|aaj|parso|tak|subah|shaam|sham|raat|dopahar|by|ho|jayega|je|ठीक|है|हाँ|हां|जी|भाई|मैं|कल|आज|परसों|तक|ज़रूर|जरूर)(?![\p{L}\p{M}])|(?:mon|tues|wednes|thurs|fri|satur|sun)day`,
  "giu",
);

/**
 * A "bare" commitment promises to act without naming what: "haan bhai, kar dunga".
 * It can acknowledge an earlier task, but must not become a task by itself.
 */
export function isBareCommitment(text, match) {
  const rest = String(text ?? "").replace(match[0], " ").replace(FILLER, " ").replace(/[^\p{L}\p{M}]+/gu, " ").trim();
  return rest.split(/\s+/).filter(Boolean).length === 0;
}

/** Hindi-script addressee: "अमित, कल तक कोटेशन भेज देना।" */
export function devanagariAddressee(body) {
  const match = String(body ?? "").match(/^(?<name>[\p{Script=Devanagari}\p{M}]+)\s*,\s*(?<rest>[\s\S]+)$/u);
  return match ? { name: match.groups.name, rest: match.groups.rest.trim() } : null;
}
