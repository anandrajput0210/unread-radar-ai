import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import reactPlugin from "@vitejs/plugin-react";
import { createServer } from "vite";

let viteServer;
let WhatChangedPanel;

before(async () => {
  viteServer = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [reactPlugin()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: "custom",
  });
  ({ WhatChangedPanel } = await viteServer.ssrLoadModule("/src/components/WhatChangedPanel.jsx"));
});

after(async () => {
  await viteServer?.close();
});

test("change panel renders task, owner, timing, and lifecycle details", () => {
  const markup = renderToStaticMarkup(React.createElement(WhatChangedPanel, {
    diff: {
      newTasks: [{ task: { id: "new-1", text: "Send the revised report" }, quote: "Please send the revised report" }],
      resolvedTasks: [{
        task: { id: "done-1", text: "Review the launch plan" },
        lifecycleType: "completed",
        lifecycleQuote: "I reviewed the launch plan",
      }],
      changedOwner: [{
        task: { id: "owner-1", text: "Prepare the slides" },
        oldValue: "Morgan",
        newValue: "Priya",
      }],
      changedDue: [{
        task: { id: "due-1", text: "Share the agenda" },
        oldValue: { dueDate: "Friday", resolvedDueDate: null },
        newValue: { dueDate: "Monday", resolvedDueDate: null },
      }],
      unchanged: 2,
    },
  }));

  assert.match(markup, /What changed since last time/u);
  assert.match(markup, /Send the revised report/u);
  assert.match(markup, /Owner changed/u);
  assert.match(markup, /Morgan to Priya/u);
  assert.match(markup, /Friday to Monday/u);
  assert.match(markup, /Completed: Review the launch plan/u);
  assert.doesNotMatch(markup, /\b(missed|overdue)\b/iu);
});
