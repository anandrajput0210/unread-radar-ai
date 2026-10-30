import test from "node:test";
import assert from "node:assert/strict";
import { createSourceSnapshot, getSourceLineSpans } from "../src/lib/sourceSnapshot.js";

test("preserves original text exactly, including CRLF, whitespace and Unicode", async () => {
  const rawText = "  😀 Priya: please review café notes.  \r\n\r\nTail line\t\n";
  const snapshot = await createSourceSnapshot(rawText);
  assert.equal(snapshot.rawText, rawText);
  assert.equal(snapshot.rawText.slice(0, rawText.length), rawText);
  assert.equal(snapshot.identity.encoding, "UTF-8");
  assert.equal(snapshot.identity.offsetUnit, "UTF-16 code units");
  assert.equal(snapshot.boundaryMode, "opaque");
  assert.equal(snapshot.messages.length, 1);
  assert.equal(snapshot.messages[0].rawText, rawText);
  assert.equal(snapshot.messages[0].authorRaw, null);
  assert.equal(snapshot.messages[0].timestampRaw, null);
});

test("recognizes explicit chat headers while preserving source order and offsets", async () => {
  const rawText = [
    "[30/10/2026, 09:08] Priya: @Anand please review the report.",
    "[30/10/2026, 09:09] Anand: I will review it today.",
  ].join("\r\n");
  const snapshot = await createSourceSnapshot(rawText);
  assert.equal(snapshot.boundaryMode, "recognized");
  assert.equal(snapshot.messages.length, 2);
  assert.equal(snapshot.messages[0].authorRaw, "Priya");
  assert.equal(snapshot.messages[0].timestampRaw, "30/10/2026, 09:08");
  assert.equal(snapshot.messages[1].authorRaw, "Anand");
  assert.equal(snapshot.messages[0].ordinal, 0);
  assert.equal(snapshot.messages[1].ordinal, 1);
  assert.equal(snapshot.messages[0].rawText, "[30/10/2026, 09:08] Priya: @Anand please review the report.");
  for (const message of snapshot.messages) {
    assert.equal(snapshot.rawText.slice(message.startOffset, message.endOffset), message.rawText);
  }
});

test("uses one opaque source message when even one non-empty row lacks a recognizable header", async () => {
  const rawText = "Priya: please review the report.\nThis continuation has no header.";
  const snapshot = await createSourceSnapshot(rawText);
  assert.equal(snapshot.boundaryMode, "opaque");
  assert.equal(snapshot.messageGranularity, "single-source-message");
  assert.equal(snapshot.messages.length, 1);
  assert.equal(snapshot.messages[0].authorRaw, null);
  assert.equal(snapshot.messages[0].timestampRaw, null);
  assert.equal(snapshot.messages[0].rawText, rawText);
});

test("snapshot IDs are deterministic for identical imports and distinct for changed imports", async () => {
  const first = await createSourceSnapshot("Alex: send report.\n");
  const identical = await createSourceSnapshot("Alex: send report.\n");
  const changed = await createSourceSnapshot("Alex: send report.\nBea: received.");
  assert.equal(first.snapshotId, identical.snapshotId);
  assert.notEqual(first.snapshotId, changed.snapshotId);
  assert.equal(first.messages[0].messageId, identical.messages[0].messageId);
});

test("duplicate records receive distinct snapshot-local message IDs", async () => {
  const rawText = "[30/10/2026, 09:08] Priya: Same line.\n[30/10/2026, 09:08] Priya: Same line.";
  const snapshot = await createSourceSnapshot(rawText);
  assert.equal(snapshot.messages.length, 2);
  assert.notEqual(snapshot.messages[0].messageId, snapshot.messages[1].messageId);
  assert.equal(snapshot.messages[0].rawText, snapshot.messages[1].rawText);
});

test("line spans use exact UTF-16 offsets and exclude line terminators", () => {
  const rawText = "😀 first\r\nsecond\n";
  const spans = getSourceLineSpans(rawText);
  assert.equal(rawText.slice(spans[0].startOffset, spans[0].endOffset), "😀 first");
  assert.equal(rawText.slice(spans[1].startOffset, spans[1].endOffset), "second");
  assert.equal(spans[0].endOffset, 8); // emoji occupies two UTF-16 code units
});
