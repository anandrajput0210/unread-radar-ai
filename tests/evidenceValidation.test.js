import test from "node:test";
import assert from "node:assert/strict";
import { createSourceSnapshot } from "../src/lib/sourceSnapshot.js";
import {
  createEvidenceReference,
  remapEvidenceReference,
  validateEvidenceReference,
} from "../src/lib/evidenceValidation.js";

async function makeEvidence(snapshot, text) {
  const startOffset = snapshot.rawText.indexOf(text);
  assert.notEqual(startOffset, -1);
  return createEvidenceReference(snapshot, {
    startOffset,
    endOffset: startOffset + text.length,
  });
}

test("validates source reference integrity without claiming semantic correctness", async () => {
  const rawText = "[30/10/2026, 09:08] Priya: Please review the report.";
  const snapshot = await createSourceSnapshot(rawText);
  const created = await makeEvidence(snapshot, "Please review the report.");
  const result = validateEvidenceReference(snapshot, created.reference);
  assert.equal(created.status, "valid");
  assert.equal(result.valid, true);
  assert.equal(result.status, "valid");
  assert.equal(result.semanticStatus, "unverified");
});

test("rejects forged quotations, malformed spans and spans outside the referenced message", async () => {
  const snapshot = await createSourceSnapshot("[30/10/2026, 09:08] Priya: Review this.\n[30/10/2026, 09:09] Anand: Done.");
  const created = await makeEvidence(snapshot, "Review this.");
  assert.equal(validateEvidenceReference(snapshot, { ...created.reference, quote: "reviewed this" }).status, "invalid");
  assert.equal(validateEvidenceReference(snapshot, { ...created.reference, startOffset: -1 }).status, "invalid");
  assert.equal(validateEvidenceReference(snapshot, { ...created.reference, endOffset: snapshot.messages[1].endOffset }).status, "invalid");
});

test("marks references from another snapshot as stale", async () => {
  const oldSnapshot = await createSourceSnapshot("Alex: Send report.");
  const newSnapshot = await createSourceSnapshot("Alex: Send updated report.");
  const created = await makeEvidence(oldSnapshot, "Send report.");
  assert.equal(validateEvidenceReference(newSnapshot, created.reference).status, "stale");
});

test("remaps evidence only to one exact matching message in a changed snapshot", async () => {
  const oldSnapshot = await createSourceSnapshot([
    "[30/10/2026, 09:08] Alex: Send the report.",
    "[30/10/2026, 09:09] Bea: Thanks.",
  ].join("\n"));
  const newSnapshot = await createSourceSnapshot([
    "[30/10/2026, 09:07] Sam: New context.",
    "[30/10/2026, 09:08] Alex: Send the report.",
    "[30/10/2026, 09:09] Bea: Thanks.",
  ].join("\n"));
  const created = await makeEvidence(oldSnapshot, "Send the report.");
  const remapped = remapEvidenceReference(created.reference, oldSnapshot, newSnapshot);
  assert.equal(remapped.status, "valid");
  assert.equal(remapped.semanticStatus, "unverified");
  assert.equal(validateEvidenceReference(newSnapshot, remapped.reference).valid, true);
  assert.notEqual(oldSnapshot.snapshotId, newSnapshot.snapshotId);
});

test("does not guess when exact duplicate candidate messages make re-import ambiguous", async () => {
  const oldSnapshot = await createSourceSnapshot("[30/10/2026, 09:08] Alex: Send the report.");
  const newSnapshot = await createSourceSnapshot([
    "[30/10/2026, 09:08] Alex: Send the report.",
    "[30/10/2026, 09:08] Alex: Send the report.",
  ].join("\n"));
  const created = await makeEvidence(oldSnapshot, "Send the report.");
  const result = remapEvidenceReference(created.reference, oldSnapshot, newSnapshot);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.reference, null);
});

test("marks changed or deleted source messages stale rather than fuzzy-matching them", async () => {
  const oldSnapshot = await createSourceSnapshot("[30/10/2026, 09:08] Alex: Send the report.");
  const newSnapshot = await createSourceSnapshot("[30/10/2026, 09:08] Alex: Send the updated report.");
  const created = await makeEvidence(oldSnapshot, "Send the report.");
  const result = remapEvidenceReference(created.reference, oldSnapshot, newSnapshot);
  assert.equal(result.status, "stale");
  assert.equal(result.reference, null);
});

test("keeps a snapshot-local reference unchanged when the re-import is identical", async () => {
  const snapshot = await createSourceSnapshot([
    "[30/10/2026, 09:08] Alex: Same line.",
    "[30/10/2026, 09:08] Alex: Same line.",
  ].join("\n"));
  const created = await makeEvidence(snapshot, "Same line.");
  const result = remapEvidenceReference(created.reference, snapshot, snapshot);
  assert.equal(result.status, "valid");
  assert.deepEqual(result.reference, created.reference);
});

test("does not remap across source-format changes even when message text matches", async () => {
  const oldSnapshot = await createSourceSnapshot("Alex: Send report.", { sourceFormat: "plain-text" });
  const newSnapshot = await createSourceSnapshot("Alex: Send report.", { sourceFormat: "other-import-format" });
  const created = await makeEvidence(oldSnapshot, "Send report.");
  const result = remapEvidenceReference(created.reference, oldSnapshot, newSnapshot);
  assert.equal(result.status, "stale");
});

test("does not remap one of several indistinguishable old messages to a lone new occurrence", async () => {
  const oldSnapshot = await createSourceSnapshot([
    "[30/10/2026, 09:08] Alex: Same line.",
    "[30/10/2026, 09:08] Alex: Same line.",
  ].join("\n"));
  const newSnapshot = await createSourceSnapshot("[30/10/2026, 09:08] Alex: Same line.");
  const created = await makeEvidence(oldSnapshot, "Same line.");
  const result = remapEvidenceReference(created.reference, oldSnapshot, newSnapshot);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.reference, null);
});
