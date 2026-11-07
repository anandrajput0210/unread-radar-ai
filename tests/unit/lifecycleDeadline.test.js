import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";

// Regression tests from the dev-split error inventory (npm run bench:inventory).
const owners = (a) => a.map((t) => t.owner);
const run = async (lines) => (await analyzeTextWithRules(lines.join("\n"))).actions;

test("delay with a new date and a pronoun ('will send it on Thursday instead') updates the same task", async () => {
  const a = await run([
    "[10:00, 02/11/2026] Max: Zara, please send the report by Wednesday.",
    "[10:00, 03/11/2026] Zara: Running late, will send it on Thursday instead.",
  ]);
  assert.equal(a.length, 1);
  assert.equal(a[0].lifecycleStatus, "delayed");
  assert.equal(a[0].resolvedDueDate, "2026-11-05");
  assert.equal(a[0].originalResolvedDueDate, "2026-11-04");
});

test("a status update uses a synonym verb (share vs send) to find its task", async () => {
  const a = await run([
    "[10:00, 02/11/2026] Meena: Zoya, share the audit report by Friday.",
    "[09:00, 04/11/2026] Zoya: Delayed, need one more day. Will send on Monday.",
  ]);
  assert.equal(a.length, 1);
  assert.equal(a[0].lifecycleStatus, "delayed");
  assert.equal(a[0].resolvedDueDate, "2026-11-09");
});

test("replying 'I'll send it' to an unowned request claims it and confirms it", async () => {
  const [t] = await run([
    "[10:01, 02/11/2026] Priya: Could you send over the updated proposal by Monday?",
    "[10:05, 02/11/2026] Vikram: Yes, I'll send it by Monday morning.",
  ]);
  assert.equal(t.owner, "Vikram");
  assert.equal(t.ownerSource, "claimed_by_commitment");
  assert.equal(t.outcome, "confirmed");
  assert.equal(t.sourceReferenceStatus, "valid");
});

test("'Will do.' answers the request directly before it, not an older task of the same speaker", async () => {
  const a = await run([
    "[10:00, 02/11/2026] Priya: Rahul, please send the brochure by Friday.",
    "[10:01, 02/11/2026] Rahul: Sure.",
    "[10:20, 02/11/2026] Priya: Also can you share the GST invoice for October?",
    "[10:25, 02/11/2026] Rahul: Will do.",
  ]);
  const invoice = a.find((t) => /GST invoice/.test(t.text));
  assert.equal(invoice.owner, "Rahul");
  assert.ok(invoice.acknowledgedBy);
});

test("no claim when the speaker already owns an open task (ambiguous)", async () => {
  const a = await run([
    "12/05/2025, 9:16 am - Anand: Rahul, please send the quotation to the client by Wednesday.",
    "12/05/2025, 9:20 pm - Anand: Bhai kal tak client ko quotation bhej dena.",
    "13/05/2025, 10:02 am - Rahul: Client details are missing. I'll send it tomorrow.",
  ]);
  assert.equal(a.filter((t) => t.owner === "Rahul").length, 1);
});

test("no claim when two unowned requests could both be meant", async () => {
  const a = await run([
    "[10:00, 02/11/2026] Priya: Could you send the invoice today?",
    "[10:01, 02/11/2026] Priya: Could you send the contract today?",
    "[10:05, 02/11/2026] Vikram: I'll send it later.",
  ]);
  assert.equal(a.length, 3); // two untouched requests + the promise as its own task
  assert.deepEqual(owners(a), [null, null, "Vikram"]);
  assert.notEqual(a[2].ownerSource, "claimed_by_commitment"); // an ordinary self-commitment, not a claim
});

test("an explicit requester deadline is not silently replaced by a promised date", async () => {
  const [t] = await run([
    "[10:01, 02/11/2026] Priya: Hi team, we need the revised brochure PDF by Friday.",
    "[10:03, 02/11/2026] Rahul: Sure, I'll send it by Thursday evening.",
  ]);
  assert.equal(t.resolvedDueDate, "2026-11-06");
  assert.equal(t.owner, "Rahul");
});

test("several named assignments in one message each keep their own owner, text and deadline", async () => {
  const a = await run(["[10:00, 05/11/2026] Boss: Priya, please book the flight; Rahul, update the itinerary by tomorrow; and someone call the hotel."]);
  assert.equal(a.length, 3);
  const [priya, rahul, hotel] = a;
  assert.deepEqual([priya.owner, priya.text, priya.resolvedDueDate], ["Priya", "book the flight", null]);
  assert.deepEqual([rahul.owner, rahul.text, rahul.resolvedDueDate], ["Rahul", "update the itinerary by tomorrow", "2026-11-06"]);
  assert.deepEqual([hotel.owner, hotel.text], [null, "call the hotel"]);
});

test("every lifecycle event and supporting reference in these flows is a valid exact quote", async () => {
  const text = "[10:00, 02/11/2026] Max: Zara, please send the report by Wednesday.\n[10:00, 03/11/2026] Zara: Running late, will send it on Thursday instead.";
  const [t] = (await analyzeTextWithRules(text)).actions;
  for (const e of t.lifecycleEvents) {
    assert.equal(e.sourceReferenceStatus, "valid");
    assert.equal(text.slice(e.evidence.startOffset, e.evidence.endOffset), e.evidence.quote);
  }
  assert.ok(t.lifecycleEvents.length > 0);
});

// A speaker answering their OWN request is never a claim, whatever the export header looks like.
const HEADERS = {
  "bracket 24h": (d, t, who, msg) => `[${t}, ${d}] ${who}: ${msg}`,
  "android 12h": (d, t, who, msg) => `${d}, ${t} am - ${who}: ${msg}`,
  "ios seconds": (d, t, who, msg) => `[${d}, ${t}:00 AM] ${who}: ${msg}`,
  "no timestamp": (_d, _t, who, msg) => `${who}: ${msg}`,
};
for (const [name, fmt] of Object.entries(HEADERS)) {
  test(`own request is never self-claimed (${name})`, async () => {
    const a = await run([
      fmt("02/11/2026", "10:00", "Rahul", "Please call the supplier by Friday."),
      fmt("02/11/2026", "10:05", "Rahul", "I'll call them tomorrow."),
    ]);
    assert.equal(a.length, 2, name);
    assert.ok(a.every((t) => t.ownerSource !== "claimed_by_commitment"), name);
  });
  test(`someone else's reply still claims it (${name})`, async () => {
    const a = await run([
      fmt("02/11/2026", "10:00", "Priya", "Please call the supplier by Friday."),
      fmt("02/11/2026", "10:05", "Rahul", "I'll call them tomorrow."),
    ]);
    const claimed = a.filter((t) => t.ownerSource === "claimed_by_commitment");
    assert.equal(claimed.length, 1, name);
    assert.equal(claimed[0].owner, "Rahul");
  });
}

// ---- ownership / linkage fixes (inventory round 2) ----

test('"Sure." answers a request in a two-person chat and claims it', async () => {
  const [t] = await run(["[10:20, 02/11/2026] Anil: Please prepare the Q3 summary for Thursday's review.", "[10:22, 02/11/2026] Meera: Sure."]);
  assert.equal(t.owner, "Meera");
  assert.equal(t.outcome, "confirmed");
});
test('"Sure." in a three-person chat is ambiguous and claims nothing', async () => {
  const [t] = await run(["[10:20, 02/11/2026] Anil: Please prepare the Q3 summary.", "[10:21, 02/11/2026] Dev: lol", "[10:22, 02/11/2026] Meera: Sure."]);
  assert.equal(t.owner, null);
});
test('a bare "ok" never claims anything', async () => {
  const [t] = await run(["[10:20, 02/11/2026] Anil: Please prepare the Q3 summary.", "[10:22, 02/11/2026] Meera: ok"]);
  assert.equal(t.owner, null);
});
test('"Working on the numbers now" claims an unowned request and marks it in progress', async () => {
  const [t] = await run(["[16:00, 03/11/2026] Boss: Need the Q3 numbers before the review on Thursday.", "[16:10, 03/11/2026] Asha: Working on the numbers now."]);
  assert.equal(t.owner, "Asha");
  assert.equal(t.lifecycleStatus, "in-progress");
});
test("a progress update never takes over a task that already has an owner", async () => {
  const [t] = await run(["[16:00, 03/11/2026] Boss: Asha, please send the Q3 numbers.", "[16:10, 03/11/2026] Dev: Working on the numbers now."]);
  assert.equal(t.owner, "Asha");
});
test('"I\'ll have it with you on Monday" links to the earlier request', async () => {
  const a = await run(["[10:00, 05/11/2026] Client: Could you send over the updated proposal by Monday?", "[10:05, 05/11/2026] Vikram: Yes, I'll have it with you on Monday morning."]);
  assert.equal(a.length, 1);
  assert.equal(a[0].owner, "Vikram");
});
test('Hinglish "theek hai ma\'am, kar dunga" claims the previous Hinglish request', async () => {
  const a = await run(["[11:00, 05/11/2026] Sunita: kal subah tak report mail kar dena", "[11:02, 05/11/2026] Karan: theek hai ma'am, kar dunga"]);
  assert.equal(a.length, 1);
  assert.equal(a[0].owner, "Karan");
});
test("a bare Hinglish promise with two open requests claims nothing", async () => {
  const a = await run(["[11:00, 05/11/2026] Sunita: kal tak report mail kar dena", "[11:01, 05/11/2026] Sunita: aur invoice bhi bhej dena", "[11:02, 05/11/2026] Karan: kar dunga"]);
  assert.equal(a.length, 3); // two untouched requests + the promise as its own task
  assert.deepEqual(owners(a), [null, null, "Karan"]);
  assert.equal(a[2].outcome, "possible");
});
test('"aur Pooja ko bol dena ki sample le aaye" is a task for Pooja; relaying a fact is not', async () => {
  const [t] = await run(["[11:10, 05/11/2026] Sunita: aur Pooja ko bol dena ki sample le aaye"]);
  assert.equal(t.owner, "Pooja");
  assert.equal((await run(["[11:10, 05/11/2026] Sunita: Pooja ko bol do meeting kal hai"])).length, 0);
});
test('"Deploying now" is an in-progress event', async () => {
  const [t] = await run(["[10:00, 05/11/2026] Lead: Ravi, please deploy the hotfix today.", "[10:30, 05/11/2026] Ravi: Deploying now."]);
  assert.equal(t.lifecycleStatus, "in-progress");
});

// ---- never assign to the wrong person: stale / unknown requester ----
test("a stale request is not claimed by a later acknowledgement (reviewer scenario)", async () => {
  const [t] = await run([
    "[10:00, 02/11/2026] Anil: Please prepare the Q3 summary.",
    "[10:01, 02/11/2026] Meera: Thanks.",
    "[10:05, 02/11/2026] Anil: The meeting has moved to Friday.",
    "[10:06, 02/11/2026] Anil: One more update about the slides.",
    "[10:10, 02/11/2026] Meera: Sure.",
  ]);
  assert.equal(t.owner, null);
});
test("'Will do.' far from the only unassigned request does not claim it", async () => {
  const [t] = await run([
    "[10:00, 02/11/2026] Anil: Please prepare the Q3 summary.",
    "[10:05, 02/11/2026] Anil: The meeting has moved to Friday.",
    "[10:06, 02/11/2026] Anil: One more update about the slides.",
    "[10:07, 02/11/2026] Anil: Lunch at 1.",
    "[10:10, 02/11/2026] Meera: Will do.",
  ]);
  assert.equal(t.owner, null);
});
test("an unidentifiable requester is never treated as 'someone else'", async () => {
  const a = await run([
    "Please prepare the Q3 summary for Thursday.",
    "Meera: Will do.",
  ]);
  assert.equal(a.length, 1);
  assert.equal(a[0].owner, null);
});
test("a recent acknowledgement of an unassigned request from a known other person still claims it", async () => {
  const [t] = await run([
    "[10:00, 02/11/2026] Anil: Please prepare the Q3 summary.",
    "[10:01, 02/11/2026] Meera: Will do.",
  ]);
  assert.equal(t.owner, "Meera");
});

test("a stale request is not claimed by a later content-matching commitment (reviewer scenario)", async () => {
  const a = await run([
    "[10:00, 02/11/2026] Anil: Please prepare the Q3 summary.",
    "[10:01, 02/11/2026] Meera: Thanks.",
    "[10:05, 02/11/2026] Anil: The meeting has moved to Friday.",
    "[10:06, 02/11/2026] Anil: One more update about the slides.",
    "[10:10, 02/11/2026] Meera: I'll prepare it.",
  ]);
  assert.equal(a.length, 2); // the old request stays unowned; the late promise is only a possible task
  const request = a.find((t) => /Q3 summary/.test(t.text));
  assert.equal(request.owner, null);
});
test("the same commitment within the window still claims the request", async () => {
  const a = await run([
    "[10:00, 02/11/2026] Anil: Please prepare the Q3 summary.",
    "[10:05, 02/11/2026] Anil: The meeting has moved to Friday.",
    "[10:10, 02/11/2026] Meera: I'll prepare it.",
  ]);
  assert.equal(a.length, 1);
  assert.equal(a[0].owner, "Meera");
});

// ---- a FINISHED task of the speaker must not block a new claim; an OPEN one still must ----
test("a completed earlier task does not block claiming a new request (reviewer scenario)", async () => {
  const a = await run([
    "[10:00, 02/11/2026] Priya: Rahul, please send the old report by Tuesday.",
    "[10:05, 02/11/2026] Rahul: The old report is sent.",
    "[10:10, 02/11/2026] Priya: Could you send the new proposal by Wednesday?",
    "[10:12, 02/11/2026] Rahul: I'll send it by Wednesday.",
  ]);
  assert.equal(a.length, 2);
  const proposal = a.find((t) => /proposal/.test(t.text));
  assert.equal(proposal.owner, "Rahul");
  assert.equal(proposal.ownerSource, "claimed_by_commitment");
  assert.equal(a.find((t) => /old report/.test(t.text)).lifecycleStatus, "completed");
});
test("a cancelled earlier task does not block a new claim either", async () => {
  const a = await run([
    "[10:00, 02/11/2026] Priya: Rahul, please send the old report by Tuesday.",
    "[10:05, 02/11/2026] Priya: Scratch that, we don't need the old report anymore.",
    "[10:10, 02/11/2026] Priya: Could you send the new proposal by Wednesday?",
    "[10:12, 02/11/2026] Rahul: I'll send it by Wednesday.",
  ]);
  assert.equal(a.find((t) => /proposal/.test(t.text)).owner, "Rahul");
});
test("a still-open earlier task of the speaker keeps the claim ambiguous (guard preserved)", async () => {
  const a = await run([
    "[10:00, 02/11/2026] Priya: Rahul, please send the old report by Tuesday.",
    "[10:10, 02/11/2026] Priya: Could you send the new proposal by Wednesday?",
    "[10:12, 02/11/2026] Rahul: I'll send it by Wednesday.",
  ]);
  assert.equal(a.find((t) => /proposal/.test(t.text)).owner, null);
});
// ---- exact window boundary: 3 messages back claims, 4 does not ----
const filler = (n) => Array.from({ length: n }, (_, i) => `[10:0${i + 1}, 02/11/2026] Priya: Lunch is at ${i + 1}.`);
test("a request exactly 3 messages back can be claimed", async () => {
  const [t] = await run(["[10:00, 02/11/2026] Priya: Please prepare the Q3 summary.", ...filler(2), "[10:09, 02/11/2026] Meera: I'll prepare it."]);
  assert.equal(t.owner, "Meera");
});
test("a request 4 messages back cannot be claimed", async () => {
  const a = await run(["[10:00, 02/11/2026] Priya: Please prepare the Q3 summary.", ...filler(3), "[10:09, 02/11/2026] Meera: I'll prepare it."]);
  assert.equal(a.find((t) => /Q3 summary/.test(t.text)).owner, null);
});

// ---- progress claims use the same conservative ownership policy ----
test("a progress update cannot claim the speaker's own request", async () => {
  const [task] = await run([
    "[10:00, 02/11/2026] Rahul: Please send the vendor invoice by Friday.",
    "[10:01, 02/11/2026] Rahul: Working on the vendor invoice now.",
  ]);
  assert.equal(task.owner, null);
  assert.notEqual(task.ownerSource, "claimed_by_progress");
  assert.equal(task.lifecycleStatus, "in-progress");
});

test("a stale progress update cannot claim a request outside the three-message window", async () => {
  const tasks = await run([
    "[10:00, 02/11/2026] Anil: Please prepare the Q3 numbers.",
    "[10:01, 02/11/2026] Meera: Thanks.",
    "[10:05, 02/11/2026] Anil: The meeting has moved to Friday.",
    "[10:06, 02/11/2026] Anil: One more update about the slides.",
    "[10:10, 02/11/2026] Meera: Working on the Q3 numbers now.",
  ]);
  const task = tasks.find((item) => /Q3 numbers/.test(item.text));
  assert.ok(task);
  assert.equal(task.owner, null);
  assert.notEqual(task.ownerSource, "claimed_by_progress");
});

test("a progress update does not choose between two matching recent requests", async () => {
  const tasks = await run([
    "[10:00, 02/11/2026] Priya: Could you prepare the Q3 numbers for marketing?",
    "[10:01, 02/11/2026] Anil: Could you prepare the Q3 numbers for sales?",
    "[10:02, 02/11/2026] Asha: Working on the Q3 numbers now.",
  ]);
  assert.equal(tasks.length, 2);
  assert.deepEqual(owners(tasks), [null, null]);
});

// ---- ownership guard replays reassignment and checks the CURRENT owner ----
test("a task reassigned away from the speaker does not block a new claim", async () => {
  const tasks = await run([
    "[10:00, 02/11/2026] Priya: Rahul, please send the old report by Tuesday.",
    "[10:05, 02/11/2026] Priya: Meera will take over the old report instead.",
    "[10:10, 02/11/2026] Priya: Could you send the new proposal by Wednesday?",
    "[10:12, 02/11/2026] Rahul: I'll send it by Wednesday.",
  ]);
  const oldReport = tasks.find((item) => /old report/.test(item.text));
  const proposal = tasks.find((item) => /new proposal/.test(item.text));
  assert.equal(oldReport.owner, "Meera");
  assert.equal(proposal.owner, "Rahul");
  assert.equal(proposal.ownerSource, "claimed_by_commitment");
  assert.equal(tasks.length, 2);
});

test("a task reassigned to the speaker still blocks an ambiguous new claim", async () => {
  const tasks = await run([
    "[10:00, 02/11/2026] Priya: Meera, please send the old report by Tuesday.",
    "[10:05, 02/11/2026] Priya: Rahul will take over the old report instead.",
    "[10:10, 02/11/2026] Priya: Could you send the new proposal by Wednesday?",
    "[10:12, 02/11/2026] Rahul: I'll send it by Wednesday.",
  ]);
  const oldReport = tasks.find((item) => /old report/.test(item.text));
  const proposal = tasks.find((item) => /new proposal/.test(item.text));
  assert.equal(oldReport.owner, "Rahul");
  assert.equal(proposal.owner, null);
});

test("a progress update exactly three messages after a known other's request can claim it", async () => {
  const [task] = await run([
    "[10:00, 02/11/2026] Priya: Need the Q3 numbers before the review.",
    "[10:01, 02/11/2026] Meera: Thanks.",
    "[10:05, 02/11/2026] Priya: The review has moved to Friday.",
    "[10:10, 02/11/2026] Asha: Working on the Q3 numbers now.",
  ]);
  assert.equal(task.owner, "Asha");
  assert.equal(task.ownerSource, "claimed_by_progress");
  assert.equal(task.lifecycleStatus, "in-progress");
});
