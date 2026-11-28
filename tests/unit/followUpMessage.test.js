import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";
import { createSourceSnapshot } from "../../src/lib/import/sourceSnapshot.js";
import { listSpeakers } from "../../src/lib/views/catchUpBrief.js";
import { SAMPLE_CHATS } from "../../src/lib/sampleChats.js";
import { TRAP_CHATS } from "../../src/lib/trapChats.js";
import { buildFollowUpMessage } from "../../src/lib/export/followUpMessage.js";

const HEADER = "Quick recap from the thread (from the chat text, please correct me):";

async function analyzeSample(text) {
  const [analysis, snapshot] = await Promise.all([
    analyzeTextWithRules(text),
    createSourceSnapshot(text),
  ]);
  return {
    actions: [...analysis.actions, ...analysis.reviewQueue],
    speakers: listSpeakers(snapshot),
  };
}

test("confirmed owned tasks render the exact owner, task text, and original deadline phrase", () => {
  const result = buildFollowUpMessage([{
    id: "owned",
    text: "Send the invoice",
    owner: "Maria",
    ownerSource: "unique_acknowledgement",
    outcome: "confirmed",
    classification: "assigned_task",
    dueDate: "Friday afternoon",
    lifecycleStatus: "open",
  }], { statuses: {}, speakers: ["Alex", "Maria Garcia"] });

  assert.deepEqual(result, {
    text: `${HEADER}\n\nConfirmed in this chat:\n- Maria: Send the invoice (deadline: Friday afternoon)`,
    includedCount: 1,
    openQuestionCount: 0,
  });
});

test("ambiguous owner candidates appear only in the unclear section without a name", () => {
  const result = buildFollowUpMessage([{
    id: "ambiguous",
    text: "Check the draft invoice",
    owner: null,
    ownerBasis: "ambiguous",
    ownerCandidateName: "Ravi",
    outcome: "confirmed",
    classification: "assigned_task",
    lifecycleStatus: "open",
  }], { statuses: {}, speakers: ["Ravi K", "Ravi S"] });

  assert.deepEqual(result, {
    text: `${HEADER}\n\nStill unclear - who is taking these?\n- Check the draft invoice`,
    includedCount: 1,
    openQuestionCount: 1,
  });
  assert.doesNotMatch(result.text, /Ravi/u);
});

test("possible, ownerless, and collective tasks are never placed under confirmed owners", () => {
  const result = buildFollowUpMessage([
    { id: "possible", text: "Review the supplier copy", owner: null, outcome: "possible", lifecycleStatus: "open" },
    { id: "ownerless", text: "Send the revised file", owner: null, outcome: "confirmed", lifecycleStatus: "open" },
    { id: "collective", text: "Prepare the launch notes", owner: null, classification: "collective_task", outcome: "confirmed", lifecycleStatus: "open" },
    { id: "unproven", text: "Check the final numbers", owner: "Alex", outcome: "confirmed", lifecycleStatus: "open" },
  ], { statuses: {}, speakers: ["Alex", "Morgan"] });

  assert.equal(result.text, [
    HEADER,
    "",
    "Still unclear - who is taking these?",
    "- Review the supplier copy",
    "- Send the revised file",
    "- Prepare the launch notes",
    "- Check the final numbers",
  ].join("\n"));
  assert.equal(result.includedCount, 4);
  assert.equal(result.openQuestionCount, 4);
  assert.doesNotMatch(result.text.split("Still unclear")[0], /supplier copy|revised file|launch notes|final numbers/u);
});

test("completed and cancelled tasks are omitted", () => {
  const result = buildFollowUpMessage([
    { id: "completed", text: "Send the final deck", owner: "Maria", outcome: "confirmed", classification: "assigned_task", lifecycleStatus: "completed" },
    { id: "cancelled", text: "Book the room", owner: "Alex", outcome: "confirmed", classification: "assigned_task", lifecycleStatus: "cancelled" },
  ], { statuses: {}, speakers: ["Maria", "Alex"] });

  assert.deepEqual(result, {
    text: `${HEADER}\nNo confirmed owners were found in this chat.`,
    includedCount: 0,
    openQuestionCount: 0,
  });
  assert.doesNotMatch(result.text, /final deck|Book the room/u);
});

test("manual completed and cancelled statuses are omitted", () => {
  const result = buildFollowUpMessage([
    { id: "done", text: "Close the checklist", owner: "Alex", outcome: "confirmed", classification: "assigned_task", lifecycleStatus: "open" },
    { id: "cancel", text: "Prepare the room", owner: "Morgan", outcome: "confirmed", classification: "assigned_task", lifecycleStatus: "open" },
  ], {
    statuses: { done: "completed", cancel: "cancelled" },
    speakers: ["Alex", "Morgan"],
  });

  assert.equal(result.text, `${HEADER}\nNo confirmed owners were found in this chat.`);
  assert.equal(result.includedCount, 0);
});

test("English and Hinglish samples produce exact paste-ready messages", async () => {
  const english = await analyzeSample(SAMPLE_CHATS.english);
  const hinglish = await analyzeSample(SAMPLE_CHATS.hinglish);

  assert.deepEqual(buildFollowUpMessage(english.actions, {
    statuses: {},
    speakers: english.speakers,
  }), {
    text: `${HEADER}\n\nConfirmed in this chat:\n- Maria: update the executive deck with these requests by Friday 5 PM`,
    includedCount: 1,
    openQuestionCount: 0,
  });

  assert.deepEqual(buildFollowUpMessage(hinglish.actions, {
    statuses: {},
    speakers: hinglish.speakers,
  }), {
    text: `${HEADER}\n\nConfirmed in this chat:\n- Vikram: kal tak Gupta ji ko GST invoice bhej dena.`,
    includedCount: 1,
    openQuestionCount: 0,
  });
});

test("every trap chat keeps its trap task out of the confirmed-owner section", async () => {
  const trapTaskPatterns = {
    "vague-someone": /invoice mismatch/iu,
    "ambiguous-handoff": /shared folder|latest draft/iu,
    "kal-dekhenge": /invoice mismatch/iu,
    "same-first-name": /draft invoice/iu,
  };

  for (const [trapChatId, chat] of Object.entries(TRAP_CHATS)) {
    const { actions, speakers } = await analyzeSample(chat);
    const result = buildFollowUpMessage(actions, { statuses: {}, speakers });
    const trapTask = actions.find((task) => trapTaskPatterns[trapChatId].test(task.text));
    const confirmedSection = result.text.split("Still unclear - who is taking these?")[0];

    if (trapTask) {
      assert.ok(result.text.includes(trapTask.text), `${trapChatId} trap task should remain represented`);
      assert.ok(!confirmedSection.includes(trapTask.text), `${trapChatId} trap task must not be shown with a confirmed owner`);
    } else {
      assert.equal(trapChatId, "ambiguous-handoff");
    }
    assert.doesNotMatch(confirmedSection, /-\s+Ravi:/u);
  }
});

test("empty or closed-only input explains that no confirmed owners were found", () => {
  assert.deepEqual(buildFollowUpMessage([], { statuses: {}, speakers: [] }), {
    text: `${HEADER}\nNo confirmed owners were found in this chat.`,
    includedCount: 0,
    openQuestionCount: 0,
  });
});

test("messages contain none of the banned wording or @-mentions", async () => {
  const inputs = [
    await analyzeSample(SAMPLE_CHATS.english),
    await analyzeSample(SAMPLE_CHATS.hinglish),
    ...await Promise.all(Object.values(TRAP_CHATS).map(analyzeSample)),
  ];

  for (const { actions, speakers } of inputs) {
    const { text } = buildFollowUpMessage(actions, { statuses: {}, speakers });
    assert.doesNotMatch(text, /\b(missed|overdue|forgot)\b|waiting on|failed to|@/iu);
  }
});
