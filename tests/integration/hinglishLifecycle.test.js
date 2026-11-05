import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSourceSnapshot } from "../../src/lib/import/sourceSnapshot.js";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";

const run = async (text) => (await analyzeTextWithRules(text, { sourceSnapshot: await createSourceSnapshot(text) })).actions;
const chat = (...lines) => lines.map((l, i) => `1${i % 9}/11/2025, 9:${String(10 + i).padStart(2, "0")} am - ${l}`).join("\n");
const types = (a) => a.lifecycleEvents.map((e) => e.type);

test("client-ops chat: full lifecycle across English + Hinglish", async () => {
  const text = readFileSync(new URL("../fixtures/whatsapp/client-ops.txt", import.meta.url), "utf8").replace(/\n$/, "");
  const actions = await run(text);
  const by = (re) => actions.find((a) => re.test(a.text));

  const proposal = by(/proposal/);
  assert.equal(proposal.owner, "Priya");
  assert.deepEqual(types(proposal), ["acknowledged", "delayed", "completed"]);
  assert.equal(proposal.originalDueDate, "Wednesday");

  const invoice = by(/invoice/);
  assert.equal(invoice.owner, "Vikram");
  assert.ok(!/^Vikram/.test(invoice.text), "addressee must not leak into task text");
  assert.deepEqual(types(invoice), ["acknowledged", "completed"]);

  const banner = by(/banner/);
  assert.equal(banner.owner, "Rohan");
  assert.deepEqual(types(banner), ["reassigned"]);
  assert.equal(banner.lifecycleEvents[0].previousOwner, "Neha");

  const logo = by(/logo/);
  assert.deepEqual(types(logo), ["blocked", "cancelled"]);
  assert.equal(logo.lifecycleStatus, "cancelled");
  assert.equal(actions.filter((a) => /logo/i.test(a.text)).length, 1, "cancel message must not spawn a task");

  const relay = by(/presentation/);
  assert.equal(relay.owner, "Neha");

  const nda = by(/NDA/);
  assert.equal(nda.owner, null, "no named addressee: owner stays uncertain");
  assert.equal(nda.resolvedDueDate, "2025-11-17");

  assert.ok(!actions.some((a) => /meeting|Thursday at 4/i.test(a.text)), "meeting time is not a task");
});

test("generic salutation 'Bhai' does not become an owner", async () => {
  const [task] = await run(chat("Anand: Bhai kal tak client ko quotation bhej dena."));
  assert.equal(task.owner, null);
});

test("relay of a fact, not an action, is not a task", async () => {
  assert.equal((await run(chat("Anand: Rahul ko bol do meeting kal hai."))).length, 0);
});

test("asking someone to remind another person does not assign the reminded person", async () => {
  const actions = await run(chat("Anand: Payment pending hai, Sandeep ko remind kar do."));
  assert.ok(actions.every((a) => a.owner !== "Sandeep"));
});

test("bare 'Ok' is not an acknowledgement", async () => {
  const actions = await run(chat("Anand: Priya, please send the proposal by Friday.", "Priya: Ok"));
  assert.deepEqual(types(actions[0]), []);
});

test("unblock only applies to a task that is actually blocked", async () => {
  const actions = await run(chat("Anand: Rohan, please share the logo files by Friday.", "Anand: Client ne approval de diya."));
  assert.deepEqual(types(actions[0]), []);
  const held = await run(chat("Anand: Rohan, please share the logo files by Friday.", "Anand: Rohan, logo files hold pe rakho.", "Anand: Logo files ke liye client ne approval de diya."));
  assert.deepEqual(types(held[0]), ["blocked", "unblocked"]);
  assert.equal(held[0].lifecycleStatus, "assigned");
});

test("reassignment is not guessed when the previous owner has two matching tasks", async () => {
  const actions = await run(chat(
    "Anand: Neha, please finalise the homepage banner by Friday.",
    "Anand: Neha, please finalise the banner copy by Friday.",
    "Anand: Banner ka kaam ab Rohan karega, Neha ko ye nahi karna.",
  ));
  assert.ok(actions.every((a) => a.owner === "Neha"));
});

test("ownerless status report is not attached to someone else's task", async () => {
  const actions = await run(chat("Anand: Priya, please send the invoice by Friday.", "Vikram: Invoice bhej diya hai."));
  assert.deepEqual(types(actions[0]), []);
});
