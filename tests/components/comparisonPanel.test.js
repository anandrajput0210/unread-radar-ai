import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import reactPlugin from "@vitejs/plugin-react";
import { createServer } from "vite";

let viteServer;
let ComparisonPanel;

before(async () => {
  viteServer = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [reactPlugin()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  ({ ComparisonPanel } = await viteServer.ssrLoadModule("/src/components/ComparisonPanel.jsx"));
});

after(async () => {
  await viteServer?.close();
});

function render(props) {
  return renderToStaticMarkup(React.createElement(ComparisonPanel, props));
}

test("empty manifest renders only the comparison empty-state message", () => {
  const markup = render({
    trapChatId: "same-first-name",
    analysis: { actions: [], reviewQueue: [] },
    speakers: ["Asha Verma", "Ravi Mehta", "Ravi Shah"],
  });
  const text = markup.replace(/<[^>]*>/gu, "").trim();

  assert.equal(text, "No recorded comparison for this chat yet.");
  assert.match(markup, /aria-label="Compare with a general-purpose AI"/u);
});

test("recorded comparison renders exact run label, prompt, and output beside live rules findings", () => {
  const entry = {
    trapChatId: "same-first-name",
    toolName: "General AI",
    modelName: "Model X",
    runDate: "2026-03-08",
    exactPrompt: "Read this chat.\nWho owns the invoice task?",
    outputText: "Ravi Mehta will review the invoice.\nConfidence: high.",
    screenshotPath: "same-first-name.png",
    notes: "",
  };
  const markup = render({
    trapChatId: "same-first-name",
    entries: [entry],
    analysis: {
      actions: [{
        id: "ambiguous-task",
        text: "Check the draft invoice for errors",
        owner: null,
        ownerBasis: "ambiguous",
        outcome: "confirmed",
        classification: "assigned_task",
      }],
      reviewQueue: [],
    },
    speakers: ["Asha Verma", "Ravi Mehta", "Ravi Shah"],
  });

  assert.ok(markup.includes("One run on 2026-03-08 using General AI Model X. Results vary. This is not a benchmark."));
  assert.ok(markup.includes(entry.exactPrompt));
  assert.ok(markup.includes(entry.outputText));
  assert.match(markup, /Unread Radar/u);
  assert.match(markup, /Compare with a general-purpose AI/u);
  assert.match(markup, /Check the draft invoice for errors/u);
  const rulesOutput = markup.match(/<section\b(?=[^>]*aria-label="Unread Radar output")[^>]*>([\s\S]*?)<\/section>/u)?.[1];
  assert.ok(rulesOutput);
  assert.doesNotMatch(rulesOutput, /Ravi/u);
  const panelText = markup.replace(/<[^>]*>/gu, "");
  assert.doesNotMatch(panelText, /\b(missed|overdue|forgot)\b|waiting on|failed to|@/iu);
});
