import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import reactPlugin from "@vitejs/plugin-react";
import { createServer } from "vite";

let viteServer;
let TaskSourcePane;

before(async () => {
  viteServer = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [reactPlugin()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  ({ TaskSourcePane } = await viteServer.ssrLoadModule("/src/components/TaskSourcePane.jsx"));
});

after(async () => {
  await viteServer?.close();
});

const snapshot = {
  snapshotId: "snapshot-current",
  messages: [
    { messageId: "message-1", startOffset: 0, endOffset: 24, rawText: "Alex: Send the report.", authorRaw: "Alex" },
    { messageId: "message-2", startOffset: 25, endOffset: 51, rawText: "Maria: I will send it.", authorRaw: "Maria" },
  ],
};

function render(selection) {
  return renderToStaticMarkup(React.createElement(TaskSourcePane, { snapshot, selection }));
}

test("valid selected source marks its message and dims only the other messages", () => {
  const markup = render({
    reference: { snapshotId: "snapshot-current", startOffset: 1, endOffset: 10 },
    referenceStatus: "valid",
  });
  const listItems = [...markup.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gu)];

  assert.equal(listItems.length, 2);
  assert.match(listItems[0][1], /aria-current="true"/u);
  assert.doesNotMatch(listItems[0][1], /data-dimmed/u);
  assert.match(listItems[0][2], /Alex: Send the report/u);
  assert.match(listItems[1][1], /data-dimmed="true"/u);
  assert.match(listItems[1][1], /opacity-60/u);
  assert.match(listItems[1][2], /Maria: I will send it/u);
});

test("invalid references leave all source messages visible without dimming", () => {
  const markup = render({
    reference: { snapshotId: "snapshot-current", startOffset: 1, endOffset: 10 },
    referenceStatus: "invalid",
  });
  const listItems = [...markup.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gu)];

  assert.match(markup, /Source reference could not be verified/u);
  assert.equal(listItems.length, 2);
  assert.match(markup, /Alex: Send the report/u);
  assert.match(markup, /Maria: I will send it/u);
  assert.doesNotMatch(markup, /data-dimmed|opacity-60/u);
  assert.doesNotMatch(markup, /aria-current/u);
});

test("messages are shown normally when no source is selected", () => {
  const markup = render(null);

  assert.match(markup, /Select a task or evidence quote/u);
  assert.match(markup, /Alex: Send the report/u);
  assert.match(markup, /Maria: I will send it/u);
  assert.doesNotMatch(markup, /data-dimmed|opacity-60|aria-current/u);
});
