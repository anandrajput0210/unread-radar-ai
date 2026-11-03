import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseChatExport } from "../src/lib/chatExportParser.js";
import { createSourceSnapshot } from "../src/lib/sourceSnapshot.js";
import { analyzeTextWithRules } from "../src/lib/localAiEngine.js";

const fixture = (n) => readFileSync(new URL(`./fixtures/whatsapp/${n}`, import.meta.url), "utf8").replace(/\n$/, "");
const run = async (text, options = {}) => analyzeTextWithRules(text, { sourceSnapshot: await createSourceSnapshot(text, options) });

// ---- 1. bidi / invisible marks never reach parsed speaker names ----
test("authorRaw is clean for iOS, Android and isolate/embedding marks", () => {
  const ios = parseChatExport(fixture("ios-bullets-media.txt"));
  assert.deepEqual(ios.messages.map((m) => m.authorRaw), ["Anand", "Rahul", "Anand", "Rahul"]);
  const android = parseChatExport("13/05/2025, 10:02 am - \u200eRahul: hi\n13/05/2025, 10:03 am - Anand\u200e: yo\n13/05/2025, 10:04 am - \u202aNeha\u202c: ok\n13/05/2025, 10:05 am - \u2068Sam\u2069: ok");
  assert.deepEqual(android.messages.map((m) => m.authorRaw), ["Rahul", "Anand", "Neha", "Sam"]);
});

test("source text is NOT altered by author cleaning (marks stay in rawText)", () => {
  const text = "13/05/2025, 10:02 am - \u200eRahul: hi\n13/05/2025, 10:03 am - Anand: yo";
  const m = parseChatExport(text).messages[0];
  assert.ok(text.slice(m.startOffset, m.endOffset).includes("\u200e"));
});

test("lifecycle attribution works when speaker names carry bidi marks", async () => {
  const text = [
    "12/05/2025, 9:16 am - \u200eAnand: Rahul, please send the quotation to the client by Wednesday.",
    "12/05/2025, 9:18 am - \u200eRahul: I'm on it.",
    "14/05/2025, 4:40 pm - \u200eRahul: Quotation sent.",
  ].join("\n");
  const [task] = (await run(text)).actions.filter((a) => a.owner === "Rahul");
  assert.equal(task.lifecycleStatus, "completed");
  assert.deepEqual(task.lifecycleEvents.map((e) => e.type), ["acknowledged", "completed"]);
});

// ---- 2. date-order conflict / missing dates never produce confident wrong dates ----
test("conflicting date order: only self-evident dates resolve; others stay null (never 'today')", async () => {
  const text = [
    "25/12/2025, 10:00 am - Anand: Rahul, please send the report kal tak.",
    "03/04/2025, 10:01 am - Anand: Neha, please send the deck kal tak.",
    "12/25/2025, 10:02 am - Rahul: ok",
  ].join("\n");
  const snap = await createSourceSnapshot(text);
  assert.ok(snap.importWarnings.some((w) => w.code === "DATE_ORDER_CONFLICT"));
  const actions = (await analyzeTextWithRules(text, { sourceSnapshot: snap })).actions;
  const rahul = actions.find((a) => a.owner === "Rahul");
  const neha = actions.find((a) => a.owner === "Neha");
  assert.equal(rahul.resolvedDueDate, "2025-12-26");
  assert.equal(neha.resolvedDueDate, null);
});

test("untimestamped text never resolves relative deadlines against today's date", async () => {
  const text = "Anand: Rahul, please send the report tomorrow.";
  const [task] = (await run(text)).actions;
  assert.equal(task.resolvedDueDate, null);
});

test("explicit user date order changes interpretation and snapshot identity", async () => {
  const text = "01/02/2025, 10:00 am - Anand: Rahul, please send the report by Friday.\n03/04/2025, 10:01 am - Rahul: ok";
  const auto = await createSourceSnapshot(text);
  const mdy = await createSourceSnapshot(text, { dateOrder: "mdy" });
  assert.notEqual(auto.snapshotId, mdy.snapshotId);
  assert.equal(auto.messages[0].timestamp.date, "2025-02-01");
  assert.equal(mdy.messages[0].timestamp.date, "2025-01-02");
  assert.equal((await createSourceSnapshot(text)).snapshotId, auto.snapshotId, "auto identity stays stable");
  const dueAuto = (await analyzeTextWithRules(text, { sourceSnapshot: auto })).actions[0].resolvedDueDate;
  const dueMdy = (await analyzeTextWithRules(text, { sourceSnapshot: mdy })).actions[0].resolvedDueDate;
  assert.notEqual(dueAuto, dueMdy);
});

// ---- 3. delay merge identity ----
test("does NOT merge when the new commitment names a different deliverable (same verb)", async () => {
  const text = [
    "12/05/2025, 9:00 am - Anand: Rahul, please send the invoice to Beta by Thursday.",
    "13/05/2025, 10:00 am - Rahul: Design is pending. I'll send the quotation tomorrow.",
  ].join("\n");
  const actions = (await run(text)).actions;
  assert.equal(actions.filter((a) => a.lifecycleStatus === "delayed").length, 0);
  const invoice = actions.find((a) => /invoice/.test(a.text));
  assert.equal(invoice.dueDate, "Thursday");
});

test("merges when the same deliverable is named", async () => {
  const text = [
    "12/05/2025, 9:00 am - Anand: Rahul, please send the quotation to Acme by Wednesday.",
    "13/05/2025, 10:00 am - Rahul: Acme details are missing. I'll send the quotation tomorrow.",
  ].join("\n");
  const actions = (await run(text)).actions.filter((a) => a.owner === "Rahul");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].lifecycleStatus, "delayed");
  assert.equal(actions[0].originalDueDate, "Wednesday");
});

test("pronoun-only delay does not merge when the speaker has two open tasks", async () => {
  const text = [
    "12/05/2025, 9:00 am - Anand: Rahul, please send the quotation to Acme by Wednesday.",
    "12/05/2025, 9:01 am - Anand: Rahul, please call Beta by Thursday.",
    "13/05/2025, 10:00 am - Rahul: Details are missing. I'll send it tomorrow.",
  ].join("\n");
  const actions = (await run(text)).actions;
  assert.equal(actions.filter((a) => a.lifecycleStatus === "delayed").length, 0);
});

// ---- 4. one boundary model for source layer and extraction ----
test("every extracted task span is exactly one snapshot message span", async () => {
  for (const name of ["android-multiline-hinglish.txt", "ios-bullets-media.txt"]) {
    const text = fixture(name);
    const snap = await createSourceSnapshot(text);
    const result = await analyzeTextWithRules(text, { sourceSnapshot: snap });
    for (const action of result.actions) {
      const span = action.sourceSpan;
      const owner = snap.messages.find((m) => span.startOffset >= m.startOffset && span.endOffset <= m.endOffset);
      assert.ok(owner, `${name}: task span lies outside every snapshot message`);
    }
  }
});

test("system, media and deleted lines never become tasks", async () => {
  const text = [
    "12/05/2025, 9:00 am - Anand created group \"please send the quote tomorrow\"",
    "12/05/2025, 9:01 am - Neha: <Media omitted>",
    "12/05/2025, 9:02 am - Rahul: This message was deleted",
    "12/05/2025, 9:03 am - Anand: Rahul, please send the quotation by Friday.",
  ].join("\n");
  const actions = (await run(text)).actions;
  assert.equal(actions.length, 1);
  assert.equal(actions[0].owner, "Rahul");
});
