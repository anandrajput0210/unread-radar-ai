import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeConversations,
  extractActions,
  extractMentions,
  urgencyFor,
} from "../../src/lib/extraction/index.js";

test("separates decisions from actionable tasks", () => {
  const result = analyzeConversations(
    [
      "Team: Agreed on submitting the final report tomorrow.",
      "We will revisit this next week.",
    ].join("\n")
  );

  assert.equal(result.actions.length, 0);
  assert.deepEqual(result.decisions, [
    "Team: Agreed on submitting the final report tomorrow.",
  ]);
});

test("does not flag negated boilerplate as a task or urgent message", () => {
  const result = analyzeConversations(
    "No action is required, and this is not urgent."
  );

  assert.equal(result.actions.length, 0);
  assert.equal(result.urgentRows.length, 0);
  assert.equal(result.alerts.length, 0);
  assert.equal(urgencyFor("This is not critical or urgent."), "Low");
});

test("supports Unicode mentions and ignores email addresses", () => {
  const mentions = extractMentions(
    "Mika: @zoë please review café notes by Friday.\n" +
    "Contact dev@example.com."
  );

  assert.deepEqual(
    mentions.map((item) => item.handle),
    ["zoë"]
  );
});

test("does not infer ownership from unrelated mentions or speaker names", () => {
  const result = analyzeConversations(
    [
      "Maya: @anand sent the file earlier. Please review the report.",
      "Ravi: Action item: send the final PDF.",
    ].join("\n")
  );

  assert.equal(result.actions.length, 2);
  assert.equal(result.actions[0].owner, null);
  assert.equal(result.actions[1].owner, null);
});

test("recognizes explicitly addressed action requests", () => {
  const result = extractActions(
    [
      "Maya: @anand please review the report by Friday.",
      "Action: @sam to review the copy tomorrow.",
    ].join("\n")
  );

  assert.equal(result.actions.length, 2);
  assert.equal(result.actions[0].owner, "@anand");
  assert.equal(result.actions[1].owner, "@sam");
});

test("correctly extracts signals from the baseline conversation", () => {
  const input = [
    "INTRODUCTION TO ELECTRICAL ENGINEERING",
    "Maya: @anand please review the report by Friday.",
    "Ravi: Action item: send the final PDF by 5pm today.",
    "Ops: Critical outage is blocking checkout. Investigate ASAP.",
    "Team: Agreed on submitting the final report tomorrow.",
  ].join("\n");

  const result = analyzeConversations(input);

  assert.equal(result.lineCount, 5);
  assert.equal(result.actions.length, 3);
  assert.equal(result.decisions.length, 1);
  assert.deepEqual(
    result.mentions.map((item) => item.handle),
    ["anand"]
  );
  assert.equal(result.deadlines.length, 2);
  assert.equal(result.urgentRows.length, 1);
  assert.equal(result.alerts.length, 6);
});

test("returns a stable result for empty or non-string input", () => {
  for (const input of ["", "   \n  ", null, undefined, 42]) {
    const result = analyzeConversations(input);

    assert.deepEqual(result.actions, []);
    assert.deepEqual(result.decisions, []);
    assert.deepEqual(result.deadlines, []);
    assert.deepEqual(result.mentions, []);
    assert.equal(result.lineCount, 0);
  }
});

test("deduplicates repeated action and deadline records", () => {
  const result = analyzeConversations(
    [
      "Sam: Action item: send report by Friday.",
      "Sam: Action item: send report by Friday.",
    ].join("\n")
  );

  assert.equal(result.actions.length, 1);
  assert.equal(result.deadlines.length, 1);
});

test("does not treat a date in an explicit no-action statement as a deadline", () => {
  const result = analyzeConversations(
    [
      "Anand: We do not need to redesign the dashboard today.",
      "Priya: Please fix the login bug by 5 PM today.",
    ].join("\n")
  );

  assert.equal(result.deadlines.length, 1);
  assert.match(result.deadlines[0].text, /fix the login bug/i);
  assert.equal(result.actions.some((item) => /redesign the dashboard/i.test(item.text)), false);
});

test("retains exact source spans for rule findings without trimming the source text", () => {
  const input = "  Priya: Action item: send the final report by Friday.  \r\nOps: Critical outage is blocking checkout.";
  const result = analyzeConversations(input);
  const action = result.actions[0];
  const exactLine = input.slice(action.sourceSpan.startOffset, action.sourceSpan.endOffset);
  assert.equal(exactLine, "  Priya: Action item: send the final report by Friday.  ");
  assert.equal(result.deadlines[0].sourceSpan.startOffset, input.indexOf("  Priya:"));
  assert.equal(result.urgentRowEvidence[0].text, "Ops: Critical outage is blocking checkout.");
  assert.equal(input.slice(result.urgentRowEvidence[0].sourceSpan.startOffset, result.urgentRowEvidence[0].sourceSpan.endOffset), result.urgentRowEvidence[0].text);
});

test("resolves named addressees, deadlines, and acknowledgements in the six-message demo chat", () => {
  const input = [
    "[14:01, 12/10/2024] Alex Johnson: Hey Team, we need to finalize the Q4 product roadmap.",
    "[14:02, 12/10/2024] Maria Garcia: Can you send over the latest feature requests?",
    "[14:05, 12/10/2024] Alex Johnson: They are in the shared drive. Maria, please update the executive deck with these requests by Friday 5 PM.",
    "[14:06, 12/10/2024] Sarah Chen: I can help review the deck.",
    "[14:10, 12/10/2024] Alex Johnson: Thanks Sarah. We also need to decide on the launch event venue, Mike, can you look into pricing for the downtown hotel? This is urgent as we need to finalize it by Monday.",
    "[14:15, 12/10/2024] Mike Ross: I'm on it.",
  ].join("\n");

  const result = analyzeConversations(input);
  assert.equal(result.actions.length, 3);

  const featureRequest = result.actions.find((item) => /latest feature requests/i.test(item.text));
  assert.ok(featureRequest);
  assert.equal(featureRequest.owner, null);
  assert.equal(featureRequest.classification, "unassigned_request");

  const deckTask = result.actions.find((item) => /executive deck/i.test(item.text));
  assert.ok(deckTask);
  assert.equal(deckTask.owner, "Maria");
  assert.equal(deckTask.dueDate, "Friday, 5 PM");
  assert.equal(deckTask.classification, "assigned_task");
  assert.equal(deckTask.dueDateStatus, "explicit");

  const hotelTask = result.actions.find((item) => /downtown hotel/i.test(item.text));
  assert.ok(hotelTask);
  assert.equal(hotelTask.owner, "Mike");
  assert.equal(hotelTask.dueDate, "Monday");
  assert.equal(hotelTask.dueDateStatus, "contextual");
  assert.equal(hotelTask.classification, "assigned_task");
  assert.equal(hotelTask.acknowledgedBy, "Mike Ross");
  assert.equal(hotelTask.acknowledgementText, "I'm on it.");
  assert.ok(hotelTask.acknowledgementSpan);
});

test("distinguishes unassigned questions from unassigned imperative candidates", () => {
  const result = extractActions([
    "Maria: Can you send over the latest feature requests?",
    "Ops: Please restart the staging service.",
  ].join("\n"));

  assert.equal(result.actions[0].classification, "unassigned_request");
  assert.equal(result.actions[1].classification, "unassigned_action");
  assert.equal(result.actions[0].owner, null);
  assert.equal(result.actions[1].owner, null);
});

test("does not turn a teammate's offer to help into an assigned task", () => {
  const result = analyzeConversations(
    "[14:06, 12/10/2024] Sarah Chen: I can help review the deck."
  );
  assert.equal(result.actions.length, 0);
});


test("does not guess which task was acknowledged when the speaker name is ambiguous", () => {
  const result = analyzeConversations([
    "[14:00, 12/10/2024] Alex: Mike, please review the hotel quote.",
    "[14:01, 12/10/2024] Sam: Mike, can you send the vendor comparison?",
    "[14:02, 12/10/2024] Mike Ross: I'm on it.",
  ].join("\n"));
  assert.equal(result.actions.length, 2);
  assert.equal(result.actions.some((item) => item.acknowledgedBy), false);
});

test("parses Android WhatsApp headers without leaking timestamp or speaker into findings", async () => {
  const input = "12/10/24, 2:01 pm - Priya: Neha, could you share the client report by tomorrow?";
  const result = analyzeConversations(input);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].owner, "Neha");
  assert.match(result.actions[0].text, /^share the client report/i);
  assert.equal(result.actions[0].messageDate, "2024-10-12");
  assert.equal(result.actions[0].resolvedDueDate, "2024-10-13");
  assert.equal(input.slice(result.actions[0].sourceSpan.startOffset, result.actions[0].sourceSpan.endOffset), input);
});

test("parses bracketed iOS-style timestamps and multiline WhatsApp messages", () => {
  const input = [
    "[14:01, 12/10/2024] Priya: Please send the quotation",
    "to the client by tomorrow.",
  ].join("\n");
  const result = analyzeConversations(input);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].messageDate, "2024-10-12");
  assert.equal(result.actions[0].resolvedDueDate, "2024-10-13");
  assert.equal(input.slice(result.actions[0].sourceSpan.startOffset, result.actions[0].sourceSpan.endOffset), input);
  assert.match(result.actions[0].text, /send the quotation/iu);
});

test("recognizes common Hinglish commitments and reminder instructions", () => {
  const result = analyzeConversations([
    "12/10/24, 2:01 pm - Priya: bhai kal tak client ko quotation bhej dena",
    "12/10/24, 2:02 pm - Aman: payment pending hai, Sandeep ko remind kar do",
  ].join("\n"));
  assert.equal(result.actions.length, 2);
  assert.match(result.actions[0].text, /quotation bhej dena/iu);
  assert.equal(result.actions[0].dueDate, "kal tak");
  assert.equal(result.actions[0].resolvedDueDate, "2024-10-13");
  assert.match(result.actions[1].text, /Sandeep ko remind kar do/iu);
});

test("extracts multiple owners from team todo bullet-style assignments", () => {
  const result = analyzeConversations("Team todo: Maria to finish the deck / Mike to book the hotel");
  assert.equal(result.actions.length, 2);
  assert.deepEqual(result.actions.map((item) => item.owner), ["Maria", "Mike"]);
  assert.deepEqual(result.actions.map((item) => item.text), ["finish the deck", "book the hotel"]);
});

test("recognizes overdue follow-ups and resolves yesterday from the source message date", () => {
  const input = "12/10/24, 2:01 pm - Priya: Neha you were supposed to send the report yesterday, still waiting";
  const result = analyzeConversations(input);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].owner, "Neha");
  assert.equal(result.actions[0].dueDate, "yesterday");
  assert.equal(result.actions[0].resolvedDueDate, "2024-10-11");
  assert.equal(result.actions[0].text, "send the report");
  assert.equal(result.actions[0].dueDateStatus, "contextual");
});

test("links an acknowledgement to the only preceding unassigned request", () => {
  const result = analyzeConversations([
    "Maya: Can someone fix the login bug?",
    "Dev: on it",
  ].join("\n"));
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].owner, "Dev");
  assert.equal(result.actions[0].ownerSource, "unique_acknowledgement");
  assert.equal(result.actions[0].acknowledgedBy, "Dev");
});


test("supports an explicit month-first WhatsApp export date order", () => {
  const result = analyzeConversations(
    "10/12/24, 2:01 pm - Priya: Please send the invoice by tomorrow",
    { dateOrder: "mdy", timeZone: "Asia/Kolkata" },
  );
  assert.equal(result.actions[0].messageDate, "2024-10-12");
  assert.equal(result.actions[0].resolvedDueDate, "2024-10-13");
});


test("does not create tasks from WhatsApp media and deleted-message placeholders", () => {
  const result = analyzeConversations([
    "12/10/24, 2:01 pm - Priya: <Media omitted>",
    "12/10/24, 2:02 pm - Aman: This message was deleted",
    "12/10/24, 2:03 pm - Priya: <This message was deleted>",
  ].join("\n"));
  assert.equal(result.actions.length, 0);
  assert.equal(result.deadlines.length, 0);
});
