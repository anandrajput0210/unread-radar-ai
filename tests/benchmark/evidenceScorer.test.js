import test from "node:test";
import assert from "node:assert/strict";
import { referenceOk } from "../../benchmark/lib/score.mjs";

// Negative controls: the scorer must FAIL bad references, not pass them by default.
const chat = { text: "AAA: one\nBBB: two", messages: [{ index: 0, start: 0, end: 8 }, { index: 1, start: 9, end: 17 }] };
const good = { startOffset: 0, endOffset: 8, quote: "AAA: one" };

test("a correct reference passes", () => assert.equal(referenceOk(chat, good, "valid", 0), true));
test("wrong quote fails", () => assert.equal(referenceOk(chat, { ...good, quote: "AAA: uno" }, "valid", 0), false));
test("pipeline status other than valid fails", () => assert.equal(referenceOk(chat, good, "unverified", 0), false));
test("reference in a different message than the task fails", () => assert.equal(referenceOk(chat, good, "valid", 1), false));
test("unmappable range fails (spans two messages)", () => assert.equal(referenceOk(chat, { startOffset: 0, endOffset: 17, quote: chat.text }, "valid", 0), false));
test("missing reference fails", () => assert.equal(referenceOk(chat, null, "valid", 0), false));
test("quote that includes the newline after a message fails", () => assert.equal(referenceOk(chat, { startOffset: 0, endOffset: 9, quote: "AAA: one\n" }, "valid", 0), false));
