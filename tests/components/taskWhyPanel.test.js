import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import reactPlugin from "@vitejs/plugin-react";
import { createServer } from "vite";

let viteServer;
let TaskWhyPanel;
let TaskCard;
let CatchUpBrief;

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
});

after(async () => {
  await viteServer?.close();
});

function render(task, speakers = [], reviewStatus) {
  return renderToStaticMarkup(React.createElement(TaskWhyPanel, {
    task,
    messages: [],
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

  assert.match(markup, /No owner could be established from this chat\./u);
  assert.doesNotMatch(markup, /Alex Johnson/u);
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
