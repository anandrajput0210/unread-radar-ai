import test from "node:test";
import assert from "node:assert/strict";
import { extractImpliedRequest } from "../../src/lib/extraction/implied.js";

const possible = (text, speaker = "Asha") => extractImpliedRequest(text, speaker);

test("a need stated with a deadline becomes a possible task with no owner", () => {
  for (const text of [
    "Need the Q3 numbers before the review on Thursday.",
    "We need the website live by 15th",
    "Also the vendor contract needs to be signed by next week.",
    "logo ka final version chahiye by Friday",
  ]) {
    const candidate = possible(text);
    assert.ok(candidate, text);
    assert.equal(candidate.outcome, "possible");
    assert.equal(candidate.owner, null, "an implied request never invents an owner");
    assert.ok(candidate.outcomeReason);
  }
});

test("reminder phrasing is a possible task", () => {
  assert.equal(possible("Don't forget to renew the domain this week.")?.outcome, "possible");
  assert.equal(possible("Remember to send the invoice")?.outcome, "possible");
});

test("a subject-less 'will ...' is attributed to the speaker as a possible commitment", () => {
  const candidate = possible("will check with legal about the wording too", "Mike");
  assert.equal(candidate.owner, "Mike");
  assert.equal(candidate.classification, "self_commitment");
  assert.equal(candidate.outcome, "possible");
});

test("needs without a deadline, negated needs, jokes and chatter are not tasks", () => {
  for (const text of [
    "I need coffee",
    "We need to discuss this",
    "We don't need the brochure by Friday",
    "No need to book the hotel by tomorrow",
    "chai chahiye bhai",
    "invoice mat bhejna abhi, chahiye by Friday",
    "we need it by Friday haha just joking",
    "Don't forget your charger lol",
    "Will do.",
  ]) {
    assert.equal(possible(text), null, text);
  }
});
