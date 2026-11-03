import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseChatExport } from "../src/lib/chatExportParser.js";
import { createSourceSnapshot } from "../src/lib/sourceSnapshot.js";
import { analyzeTextWithRules } from "../src/lib/localAiEngine.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/whatsapp/${name}`, import.meta.url), "utf8").replace(/\n$/, "");
const codes = (parsed) => parsed.warnings.map((w) => w.code);

test("Android export with multiline messages is split into individual messages", () => {
  const text = fixture("android-multiline-hinglish.txt");
  const parsed = parseChatExport(text);
  assert.equal(parsed.dialect, "whatsapp-timestamped");
  assert.equal(parsed.messages.length, 7);
  assert.deepEqual(parsed.messages.map((m) => m.authorRaw), [null, "Anand", "Rahul", "Anand", "Neha", "Rahul", "Rahul"]);
  assert.equal(parsed.messages[0].kind, "system");
  assert.equal(parsed.messages[4].kind, "media");
  assert.equal(parsed.messages[3].lineCount, 3);
  assert.equal(parsed.messages[3].timestamp.time, "21:20");
  assert.equal(parsed.messages[3].timestamp.date, "2025-05-12");
});

test("iOS bracketed export with seconds, bidi marks and bullet continuation lines", () => {
  const parsed = parseChatExport(fixture("ios-bullets-media.txt"));
  assert.equal(parsed.messages.length, 4);
  assert.equal(parsed.messages[2].authorRaw, "Anand");
  assert.equal(parsed.messages[2].lineCount, 3);
  assert.equal(parsed.messages[3].kind, "media");
  assert.equal(parsed.messages[0].timestamp.time, "09:15");
});

test("offsets are exact and body text excludes header (no timestamp/sender leakage)", () => {
  const text = fixture("android-multiline-hinglish.txt");
  const { messages } = parseChatExport(text);
  for (const m of messages) {
    const body = text.slice(m.bodyStartOffset, m.endOffset);
    assert.ok(!/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(body), `timestamp leaked: ${body}`);
    if (m.authorRaw) assert.ok(!body.startsWith(m.authorRaw), `author leaked: ${body}`);
  }
  assert.equal(text.slice(messages[3].bodyStartOffset, messages[3].endOffset).split("\n").length, 3);
});

test("narrow no-break space before AM/PM (newer exports) is recognised without altering source", () => {
  const text = "[12/05/25, 9:15:32\u202fAM] Anand: hello\n[12/05/25, 9:16:10\u202fPM] Rahul: hi";
  const parsed = parseChatExport(text);
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[1].timestamp.time, "21:16");
  assert.ok(text.slice(parsed.messages[0].startOffset, parsed.messages[0].endOffset).includes("\u202f"));
});

test("24-hour Android and a.m./p.m. variants parse", () => {
  const a = parseChatExport("12/05/2025, 21:15 - Anand: x\n12/05/2025, 21:16 - Rahul: y");
  assert.equal(a.messages[0].timestamp.time, "21:15");
  const b = parseChatExport("5/12/25, 9:15 p.m. - Anand: x\n5/13/25, 9:16 a.m. - Rahul: y");
  assert.equal(b.dateOrder.order, "mdy");
  assert.equal(b.messages[0].timestamp.date, "2025-05-12");
  assert.equal(b.messages[0].timestamp.time, "21:15");
});

test("date order is inferred from data, and ambiguity is surfaced rather than silent", () => {
  const dmy = parseChatExport("25/12/2025, 10:00 - A: x\n26/12/2025, 10:01 - B: y");
  assert.equal(dmy.dateOrder.order, "dmy");
  assert.ok(!codes(dmy).includes("DATE_ORDER_AMBIGUOUS"));
  const ambiguous = parseChatExport("01/02/2025, 10:00 - A: x\n03/04/2025, 10:01 - B: y");
  assert.ok(codes(ambiguous).includes("DATE_ORDER_AMBIGUOUS"));
  const forced = parseChatExport("01/02/2025, 10:00 - A: x\n03/04/2025, 10:01 - B: y", { dateOrder: "mdy" });
  assert.equal(forced.messages[0].timestamp.date, "2025-01-02");
  assert.ok(!codes(forced).includes("DATE_ORDER_AMBIGUOUS"));
  const conflict = parseChatExport("25/12/2025, 10:00 - A: x\n12/25/2025, 10:01 - B: y");
  assert.ok(codes(conflict).includes("DATE_ORDER_CONFLICT"));
});

test("system, deleted, forwarded and edited messages are classified, not dropped", () => {
  const text = [
    "12/05/2025, 9:00 am - Anand created group \"Ops: Client A\"",
    "12/05/2025, 9:01 am - Rahul: This message was deleted",
    "12/05/2025, 9:02 am - Neha: Forwarded\nPlease send invoice by Friday",
    "12/05/2025, 9:03 am - Anand: Ok done <This message was edited>",
  ].join("\n");
  const m = parseChatExport(text).messages;
  assert.deepEqual(m.map((x) => x.kind), ["system", "deleted", "message", "message"]);
  assert.equal(m[0].authorRaw, null);
  assert.equal(m[2].forwarded, true);
  assert.equal(m[3].edited, true);
});

test("text before the first header is an unattributed preamble with a warning", () => {
  const parsed = parseChatExport("Exported chat\n12/05/2025, 9:00 am - Anand: hi\n12/05/2025, 9:01 am - Rahul: ok");
  assert.equal(parsed.messages[0].kind, "preamble");
  assert.equal(parsed.messages[0].authorRaw, null);
  assert.equal(parsed.messages.length, 3);
  assert.ok(codes(parsed).includes("LEADING_UNRECOGNIZED_TEXT"));
});

test("date-leading lines in an unsupported style trigger a visible warning", () => {
  const text = "12/05/2025, 9:00 am - Anand: hi\n13/05/2025 सुबह 9:05 - Rahul: ok\n13/05/2025 सुबह 9:06 - Neha: ok";
  const parsed = parseChatExport(text);
  const w = parsed.warnings.find((x) => x.code === "UNPARSED_HEADER_LIKE_LINES");
  assert.ok(w);
  assert.equal(w.severity, "error");
});

test("unrecognised text is NEVER silently one message: explicit error warning", () => {
  const parsed = parseChatExport("just some pasted notes\nwith no speakers");
  assert.equal(parsed.dialect, "opaque");
  assert.equal(parsed.warnings[0].code, "UNRECOGNIZED_FORMAT");
  assert.equal(parsed.warnings[0].severity, "error");
});

test("colons inside message bodies do not create fake speakers in timestamped chats", () => {
  const text = "12/05/2025, 9:00 am - Anand: Agenda:\nNote: send quote\nRahul: will do\n12/05/2025, 9:05 am - Rahul: ok";
  const parsed = parseChatExport(text);
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].lineCount, 3);
});

test("snapshot exposes dialect, warnings and parsed timestamps through the real entry point", async () => {
  const snap = await createSourceSnapshot(fixture("android-multiline-hinglish.txt"));
  assert.equal(snap.boundaryMode, "recognized");
  assert.equal(snap.dialect, "whatsapp-timestamped");
  assert.equal(snap.messages.length, 7);
  assert.equal(snap.messages[1].timestamp.date, "2025-05-12");
  const opaque = await createSourceSnapshot("plain notes\nno speakers");
  assert.equal(opaque.boundaryMode, "opaque");
  assert.equal(opaque.importWarnings[0].code, "UNRECOGNIZED_FORMAT");
});

test("full pipeline: lifecycle updates ONE task (assigned→ack→delayed→completed) and keeps deadlines", async () => {
  const text = fixture("android-multiline-hinglish.txt");
  const snap = await createSourceSnapshot(text);
  const result = await analyzeTextWithRules(text, { sourceSnapshot: snap });
  const quotation = result.actions.filter((a) => a.owner === "Rahul");
  assert.equal(quotation.length, 1, "no orphan duplicate for the delay message");
  const [task] = quotation;
  assert.deepEqual(task.lifecycleEvents.map((e) => e.type), ["acknowledged", "delayed", "completed"]);
  assert.equal(task.lifecycleStatus, "completed");
  assert.equal(task.originalDueDate, "Wednesday");
  assert.equal(task.originalResolvedDueDate, "2025-05-14");
  assert.ok(!/\d{1,2}\/\d{1,2}\/\d{4}|Anand:|Rahul:/.test(task.text), "no header leakage in task text");
});

test("Hinglish request with no identifiable addressee keeps owner uncertain and is not leaked", async () => {
  const text = fixture("android-multiline-hinglish.txt");
  const result = await analyzeTextWithRules(text, { sourceSnapshot: await createSourceSnapshot(text) });
  const hinglish = result.actions.find((a) => /quotation bhej dena/.test(a.text));
  assert.ok(hinglish);
  assert.equal(hinglish.owner, null);
  assert.equal(hinglish.resolvedDueDate, "2025-05-13");
});

test("delay merge does NOT guess when the speaker owns two matching open tasks", async () => {
  const text = [
    "12/05/2025, 9:00 am - Anand: Rahul, please send the quotation to Acme by Wednesday.",
    "12/05/2025, 9:01 am - Anand: Rahul, please send the invoice to Beta by Thursday.",
    "13/05/2025, 10:00 am - Rahul: Details are missing. I'll send it tomorrow.",
  ].join("\n");
  const result = await analyzeTextWithRules(text, { sourceSnapshot: await createSourceSnapshot(text) });
  const delayed = result.actions.filter((a) => a.lifecycleStatus === "delayed");
  assert.equal(delayed.length, 0);
});

test("CRLF files and a stray trailing CR never merge the last message into the previous one", async () => {
  const lf = fixture("android-multiline-hinglish.txt");
  const crlf = lf.replace(/\n/g, "\r\n");
  assert.equal(parseChatExport(crlf).messages.length, 7);
  assert.equal(parseChatExport(crlf + "\r").messages.length, 7, "stray trailing CR");
  assert.equal(parseChatExport(crlf + "\r\n").messages.length, 7, "trailing CRLF");
  assert.equal(parseChatExport(lf.replace(/\n/g, "\r")).messages.length, 7, "old Mac CR-only endings");
  const t = "12/05/2025, 9:00 am - A: hi\r\n12/05/2025, 9:01 am - B: bye\r";
  const m = parseChatExport(t).messages;
  assert.equal(m.length, 2);
  assert.equal(t.slice(m[1].bodyStartOffset, m[1].endOffset), "bye");
  const snap = await createSourceSnapshot(crlf);
  assert.equal(snap.messages.length, 7);
});
