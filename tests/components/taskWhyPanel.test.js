import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import reactPlugin from "@vitejs/plugin-react";
import { createServer } from "vite";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";
import { buildFollowUpMessage } from "../../src/lib/export/followUpMessage.js";
import { createSourceSnapshot } from "../../src/lib/import/sourceSnapshot.js";
import { listSpeakers } from "../../src/lib/views/catchUpBrief.js";
import { SAMPLE_CHATS } from "../../src/lib/sampleChats.js";
import { TRAP_CHATS } from "../../src/lib/trapChats.js";

let viteServer;
let TaskWhyPanel;
let TaskCard;
let CatchUpBrief;
let App;

before(async () => {
  viteServer = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [reactPlugin()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  ({ TaskWhyPanel } = await viteServer.ssrLoadModule("/src/components/TaskWhyPanel.jsx"));
  ({ TaskCard } = await viteServer.ssrLoadModule("/src/components/TaskCard.jsx"));
  ({ CatchUpBrief } = await viteServer.ssrLoadModule("/src/components/CatchUpBrief.jsx"));
  ({ default: App } = await viteServer.ssrLoadModule("/src/App.jsx"));
});

after(async () => {
  await viteServer?.close();
});

function render(task, speakers = [], reviewStatus, messages = []) {
  return renderToStaticMarkup(React.createElement(TaskWhyPanel, {
    task,
    messages,
    speakers,
    reviewStatus,
  }));
}

function renderCard(task, status) {
  return renderToStaticMarkup(React.createElement(TaskCard, {
    task,
    status,
    onChangeStatus() {},
  }));
}

test("unknown-owner panel states that no owner was established without naming a speaker", () => {
  const markup = render({
    id: "unknown-task",
    text: "Send the report",
    owner: null,
    outcome: "confirmed",
    lifecycleEvents: [],
  }, ["Alex Johnson"]);

  assert.match(markup, /No owner was named or claimed in this chat\. Not guessing\./u);
  assert.doesNotMatch(markup, /Alex Johnson/u);
});

test("the disputed-owner explanation renders in an initially expanded Why panel", () => {
  const markup = renderToStaticMarkup(React.createElement(TaskWhyPanel, {
    task: {
      id: "disputed-task",
      text: "Send the quotation",
      owner: null,
      ownerBasis: "disputed",
      outcome: "confirmed",
      lifecycleEvents: [],
    },
    initiallyExpanded: true,
    speakers: ["Neha", "Ben"],
  }));

  assert.match(markup, /aria-expanded="true"/u);
  assert.match(markup, /More than one person may own this\. Not guessing\./u);
  assert.doesNotMatch(markup.match(/Owner basis[^<]*/u)?.[0] || "", /\b(?:Neha|Ben)\b/u);
});

test("the input panel renders the one-click demo and load-and-analyze variants", () => {
  const markup = renderToStaticMarkup(React.createElement(App));

  assert.match(markup, /Run 60-second demo/u);
  assert.match(markup, /Load English and analyze/u);
  assert.match(markup, /Load Hinglish and analyze/u);
  assert.match(markup, /aria-label="Load and analyze same first name trap chat"/u);
});

test("the header brand and document title use the same product casing", () => {
  const markup = renderToStaticMarkup(React.createElement(App));
  const document = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

  assert.match(markup, /<p\b[^>]*>Unread Radar AI<\/p>/u);
  assert.match(document, /<title>Unread Radar AI<\/title>/u);
});

test("the footer links to the source repository with a safe new tab", () => {
  const markup = renderToStaticMarkup(React.createElement(App));
  const sourceLink = markup.match(/<a\b[^>]*>Source on GitHub<\/a>/u)?.[0];

  assert.ok(sourceLink, "the footer should render a source link");
  assert.match(sourceLink, /href="https:\/\/github\.com\/anandrajput0210\/unread-radar-ai"/u);
  assert.match(sourceLink, /target="_blank"/u);
  assert.match(sourceLink, /rel="noopener noreferrer"/u);
});

test("the footer omits a build id when no Vercel SHA is defined", () => {
  const markup = renderToStaticMarkup(React.createElement(App));

  assert.doesNotMatch(markup, /\bBuild [\da-f]{7}\b/iu);
});

test("the footer shows only the first seven characters of a Vercel SHA", async () => {
  const buildServer = await createServer({
    configFile: false,
    root: process.cwd(),
    define: { __VERCEL_GIT_COMMIT_SHA__: JSON.stringify("1234567890abcdef") },
    plugins: [reactPlugin()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: { port: 24679 } },
    appType: "custom",
  });

  try {
    const { default: BuildApp } = await buildServer.ssrLoadModule("/src/App.jsx");
    const markup = renderToStaticMarkup(React.createElement(BuildApp));

    assert.match(markup, /\bBuild 1234567\b/u);
    assert.doesNotMatch(markup, /\bBuild 12345678/u);
  } finally {
    await buildServer.close();
  }
});

test("the header summary is visible and privacy details stay collapsed with the original caveats", () => {
  const markup = renderToStaticMarkup(React.createElement(App));
  const disclosure = markup.match(/<details\b([^>]*)>([\s\S]*?)<\/details>/u);

  assert.match(markup, /Shows who owes what, with the exact message as proof\. Says &#x27;Not guessing&#x27; when it can&#x27;t tell\./u);
  assert.match(markup, /Runs in your browser/u);
  assert.match(markup, /Exact-quote evidence/u);
  assert.match(markup, /English \+ Hinglish/u);
  assert.ok(disclosure);
  assert.doesNotMatch(disclosure[1], /\bopen(?:=|\s|>)/u);
  assert.match(disclosure[2], /Only analyze conversations you are authorized to use\./u);
  assert.match(disclosure[2], /Chat text and source snapshots stay in memory by default\./u);
  assert.match(disclosure[2], /This storage is not encrypted and clearing it does not guarantee forensic erasure\./u);
  assert.match(disclosure[2], /When unchecked, analysis uses deterministic local patterns only/u);
  assert.match(disclosure[2], /AI output can contain errors\. Verify important dates, owners, decisions, and urgency classifications against the original conversation\./u);
  assert.match(disclosure[2], /What it can&#x27;t do yet/u);
  assert.match(disclosure[2], /Rules-based extraction misses phrasings its patterns do not recognize\./u);
  assert.match(disclosure[2], /A generic “I can\.” volunteer on an open request is not treated as a claim\./u);
  assert.match(disclosure[2], /Two participants named Ravi K and Ravi S leave a first-name-only “Ravi” owner unknown\./u);
  assert.match(disclosure[2], /Exact-name overlap such as “Ravi” and “Ravi S” remains a known gap\./u);
  assert.match(disclosure[2], /The benchmark is synthetic and makes no real-world accuracy claim\./u);
  assert.match(disclosure[2], /One chat at a time, with a 60,000-character analysis limit\./u);
  assert.match(disclosure[2], /Import is by pasting text or selecting a local \.txt or \.log file\./u);
});

test("possible-task panel renders its explicit caveat", () => {
  const markup = render({
    id: "possible-task",
    text: "Review the draft",
    owner: null,
    outcome: "possible",
    lifecycleEvents: [],
  });

  assert.match(markup, /Possible task - not confirmed/u);
});

test("why panel renders the exact evidence quote", () => {
  const quote = "Maria, please update the executive deck by Friday.";
  const markup = render({
    id: "evidence-task",
    text: "Update the executive deck",
    owner: "Maria",
    outcome: "confirmed",
    sourceEvidence: { quote },
    sourceReferenceStatus: "valid",
    lifecycleEvents: [],
  });

  assert.ok(markup.includes(quote), "the rendered panel should preserve the exact source quote");
});

test("accepted possible task labels extractor outcome separately from human review", () => {
  const markup = render({
    id: "accepted-possible-task",
    text: "Review the draft",
    owner: null,
    outcome: "possible",
    outcomeReason: "Suggestion, not a direct request",
    humanReviewStatus: "promoted",
    lifecycleEvents: [],
  });

  assert.match(markup, /Possible candidate/u);
  assert.match(markup, /Accepted for tracking by you/u);
  assert.doesNotMatch(markup, /Possible task - not confirmed/u);
});

test("trap-chat panels show exact abstention reasons without naming speakers", async () => {
  const expectedReasons = {
    "vague-someone": "No owner was named or claimed in this chat. Not guessing.",
    "ambiguous-handoff": "No owner was named or claimed in this chat. Not guessing.",
    "kal-dekhenge": "No owner was named or claimed in this chat. Not guessing.",
    "same-first-name": "More than one person could match. Not guessing.",
  };

  for (const [name, chat] of Object.entries(TRAP_CHATS)) {
    const [analysis, snapshot] = await Promise.all([
      analyzeTextWithRules(chat),
      createSourceSnapshot(chat),
    ]);
    const speakers = listSpeakers(snapshot);
    const task = name === "same-first-name"
      ? analysis.actions.find((item) => item.text.includes("draft invoice"))
      : analysis.actions.find((item) => item.text.includes("invoice mismatch"))
        ?? analysis.actions[0];
    if (name === "same-first-name") assert.equal(task?.owner, null);
    const markup = render(task ?? {
      id: `${name}-unknown`,
      text: "No extracted task",
      owner: null,
      outcome: "confirmed",
      lifecycleEvents: [],
    }, speakers, undefined, snapshot.messages);
    const ownerSection = markup.match(/<section aria-label="Owner basis">([\s\S]*?)<\/section>/u)?.[1];

    assert.ok(ownerSection, `${name} panel should render the owner-basis section`);
    assert.ok(ownerSection.includes(expectedReasons[name]), `${name} panel should show the exact reason`);
    for (const speaker of speakers) {
      assert.ok(!ownerSection.includes(speaker), `${name} owner reason must not name ${speaker}`);
    }
    if (name === "vague-someone") {
      assert.ok(markup.includes("Not confirmed. Needs a human look."));
    }
  }
});

test("manually confirmed possible task keeps its extractor label without a review warning", () => {
  const task = {
    id: "manual-accepted-task",
    text: "Review the draft",
    owner: null,
    classification: "unassigned_request",
    outcome: "possible",
    outcomeReason: "Suggestion, not a direct request",
    lifecycleEvents: [],
  };
  const panel = render(task, [], "confirmed");
  const card = renderCard(task, "confirmed");

  assert.match(panel, /Possible candidate/u);
  assert.match(panel, /Confirmed by you/u);
  assert.doesNotMatch(panel, /Possible task - not confirmed/u);
  assert.match(card, /Extractor: possible/u);
  assert.match(card, /Confirmed by you/u);
  assert.doesNotMatch(card, /Review this candidate before relying on it/u);
});

test("promoted task does not display extraction as independently confirmed", () => {
  const card = renderCard({
    id: "promoted-possible-task",
    text: "Review the draft",
    owner: null,
    classification: "user_confirmed_candidate",
    outcome: "possible",
    humanReviewStatus: "promoted",
    lifecycleEvents: [],
  }, "confirmed");

  assert.match(card, /Extractor: possible/u);
  assert.match(card, /Promoted by you/u);
  assert.doesNotMatch(card, /Confirmed extraction/u);
});

test("task card does not label an owner as assigned without structured provenance", () => {
  const card = renderCard({
    id: "unclear-owner",
    text: "Review the report",
    owner: "Priya",
    classification: "unclassified_candidate",
    outcome: "confirmed",
    lifecycleEvents: [],
  }, "needs-review");

  assert.match(card, /Owner basis unclear · not assigned to a participant/u);
  assert.doesNotMatch(card, /Assigned task · Priya/u);
  assert.doesNotMatch(card, /Priya/u);
});

test("accepted possible task is ownerless and shows extraction and review statuses separately", () => {
  const markup = renderToStaticMarkup(React.createElement(CatchUpBrief, {
    actions: [{
      id: "possible-confirmed",
      text: "Review the draft",
      owner: null,
      outcome: "possible",
      lifecycleStatus: "open",
    }],
    snapshot: { messages: [{ kind: "message", authorRaw: "Alex" }] },
    statuses: { "possible-confirmed": "confirmed" },
    me: "Alex",
    asOf: "2026-11-25",
    onChangeMe() {},
    onChangeAsOf() {},
  }));

  assert.match(markup, /Owner not established/u);
  assert.match(markup, /Extractor: possible/u);
  assert.match(markup, /Confirmed by you/u);
  assert.doesNotMatch(markup, /Needs a human look/u);
  assert.doesNotMatch(markup, /Assigned to you/u);
});

test("catch-up brief previews the generated follow-up message beside its copy control", async () => {
  const [analysis, snapshot] = await Promise.all([
    analyzeTextWithRules(SAMPLE_CHATS.english),
    createSourceSnapshot(SAMPLE_CHATS.english),
  ]);
  const actions = [...analysis.actions, ...analysis.reviewQueue];
  const followUp = buildFollowUpMessage(actions, {
    statuses: {},
    speakers: listSpeakers(snapshot),
  });
  const markup = renderToStaticMarkup(React.createElement(CatchUpBrief, {
    actions: analysis.actions,
    reviewQueue: analysis.reviewQueue,
    snapshot,
    statuses: {},
    me: null,
    onChangeMe() {},
    onChangeAsOf() {},
  }));

  assert.ok(markup.includes(followUp.text));
  assert.match(markup, /Copy follow-up message/u);
  assert.match(markup, /aria-live="polite"/u);
});
