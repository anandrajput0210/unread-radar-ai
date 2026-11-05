import test from "node:test";
import assert from "node:assert/strict";
import { devanagariAddressee, hasHindiAction, hasHindiNegation, isBareCommitment, isJoking, matchHindiCommitment } from "../../src/lib/extraction/hindi.js";

test("Hinglish and Devanagari imperatives are recognised", () => {
  for (const text of ["invoice bhej dena", "check kar lena", "bata do please", "कोटेशन भेज देना", "चेक कर लेना"]) {
    assert.ok(hasHindiAction(text), text);
  }
  assert.equal(hasHindiAction("meeting kal hai"), false);
});

test("prohibitions are detected, including Devanagari", () => {
  for (const text of ["invoice mat bhejna abhi", "Neha ko ye kaam nahi karna hai", "यह मत भेजो"]) {
    assert.ok(hasHindiNegation(text), text);
  }
  assert.equal(hasHindiNegation("invoice bhej dena"), false);
});

test("first-person commitments are matched and bare ones are flagged", () => {
  const bare = "haan bhai, kar dunga";
  assert.ok(isBareCommitment(bare, matchHindiCommitment(bare)));
  const named = "main kal subah tak design bhej dunga";
  assert.equal(isBareCommitment(named, matchHindiCommitment(named)), false);
  const deva = "ठीक है, कर दूंगा।";
  assert.ok(matchHindiCommitment(deva));
});

test("jokes are recognised so they are never turned into tasks", () => {
  assert.ok(isJoking("kal tak sab ho jayega haha just joking 😂"));
  assert.equal(isJoking("kal tak bhej dena"), false);
});

test("a Devanagari addressee is split from the request", () => {
  assert.deepEqual(devanagariAddressee("अमित, कल तक कोटेशन भेज देना।"), { name: "अमित", rest: "कल तक कोटेशन भेज देना।" });
  assert.equal(devanagariAddressee("Amit, please send it"), null);
});
