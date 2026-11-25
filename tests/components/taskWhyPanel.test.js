import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import reactPlugin from "@vitejs/plugin-react";
import { createServer } from "vite";

let viteServer;
let TaskWhyPanel;

before(async () => {
  viteServer = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [reactPlugin()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: "custom",
  });
  ({ TaskWhyPanel } = await viteServer.ssrLoadModule("/src/components/TaskWhyPanel.jsx"));
});

after(async () => {
  await viteServer?.close();
});

function render(task, speakers = []) {
  return renderToStaticMarkup(React.createElement(TaskWhyPanel, {
    task,
    messages: [],
    speakers,
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
