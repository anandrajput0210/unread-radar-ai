import test from "node:test";
import assert from "node:assert/strict";
import { resolveParticipantIdentity } from "../../src/lib/identity.js";
import { ownerMatchesSpeaker } from "../../src/lib/extraction/matching.js";
import { sameSpeaker } from "../../src/lib/extraction/claims.js";

test("identity resolution only uses whole-token participant names", () => {
  assert.deepEqual(
    resolveParticipantIdentity("Ann", ["Joanne"]),
    { status: "none", participant: null },
  );
});

test("a first name shared by distinct participants remains ambiguous", () => {
  assert.deepEqual(
    resolveParticipantIdentity("Ravi", ["Ravi K", "Ravi S"]),
    { status: "ambiguous", participant: null },
  );
});

test("a full name resolves uniquely when participants share a first name", () => {
  assert.deepEqual(
    resolveParticipantIdentity("Ravi K", ["Ravi K", "Ravi S"]),
    { status: "resolved", participant: "Ravi K" },
  );
});

test("an exact participant name takes precedence over a longer related name", () => {
  assert.deepEqual(
    resolveParticipantIdentity("Ravi", ["Ravi", "Ravi S"]),
    { status: "resolved", participant: "Ravi" },
  );
});

test("lifecycle identity compares resolved participants, not shared first tokens", () => {
  const speakers = ["Ravi K", "Ravi"];
  assert.equal(ownerMatchesSpeaker("Ravi K", "Ravi", speakers), false);
  assert.equal(ownerMatchesSpeaker("Neha Shah", "Neha", ["Neha Shah"]), true);
});

test("unknown or ambiguous names never prove two speakers are different", () => {
  assert.equal(sameSpeaker(null, "Ravi K", ["Ravi K", "Ravi S"]), true);
  assert.equal(sameSpeaker("Ravi", "Ravi K", ["Ravi K", "Ravi S"]), true);
  assert.equal(sameSpeaker("Cafe\u0301", "Café", ["Café"]), true);
});
