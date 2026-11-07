#!/usr/bin/env node
// Error inventory for lifecycle / deadline / linkage / evidence. DEV split only by design:
// per-case failures from a sealed holdout must never be read. Usage: node benchmark/inventory.mjs [--md]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSplit } from "./lib/loadCases.mjs";
import { analyzeTextWithRules } from "../src/lib/ai/localAiEngine.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const norm = (s) => String(s ?? "").toLocaleLowerCase().replace(/^@/, "").trim();
const rows = [];

for (const chat of loadSplit(root, "dev")) {
  const shown = await analyzeTextWithRules(chat.text);
  const at = (a) => chat.messages.find((m) => a.sourceSpan?.startOffset >= m.start && a.sourceSpan.startOffset < m.end)?.index ?? -1;
  const seen = new Map(); // gold tasks sharing a message are paired with predictions in order
  for (const g of chat.goldTasks) {
    const key = g.msgs[0];
    const k = seen.get(key) ?? 0; seen.set(key, k + 1);
    const here = shown.actions.filter((a) => at(a) === key);
    const pred = here.length > k ? [here[k]] : [];
    const quote = (i) => chat.messages[i]?.line?.replace(/^\[[^\]]*\]\s*/, "") ?? "";
    const base = { chat: chat.id, message: quote(g.msgs[0]) };
    if (!pred.length) { rows.push({ ...base, kind: "linkage", expected: "task found", actual: "no task" }); continue; }
    const a = pred[0];
    if (g.status && (a.lifecycleStatus || "open") !== g.status) {
      const evidenceCount = (a.lifecycleEvents || []).length;
      rows.push({ ...base, kind: "lifecycle", expected: g.status, actual: `${a.lifecycleStatus} (${evidenceCount} event${evidenceCount === 1 ? "" : "s"})`,
        why: evidenceCount === 0 ? "update message not linked to the task" : "event linked but wrong type" });
    }
    const due = typeof a.resolvedDueDate === "string" ? a.resolvedDueDate : null;
    if ((g.due || null) !== due) rows.push({ ...base, kind: "deadline", expected: g.due || "none", actual: due || "none",
      why: g.due && !due ? "deadline not recognised" : !g.due && due ? "spurious deadline" : "wrong date resolved" });
    if (g.owner !== null && g.owner !== undefined && norm(a.owner).split(/\s+/)[0] !== norm(g.owner).split(/\s+/)[0]) rows.push({ ...base, kind: "ownership", expected: g.owner, actual: a.owner || "none" });
    if (g.owner === null && a.owner && g.status !== "reassigned") rows.push({ ...base, kind: "ownership", expected: "no owner", actual: a.owner, why: "owner invented/over-assigned" });
    for (const e of a.lifecycleEvents || []) if (e.sourceReferenceStatus !== "valid") rows.push({ ...base, kind: "evidence", expected: "valid reference", actual: e.sourceReferenceStatus });
  }
}
const by = rows.reduce((m, r) => ((m[r.kind] = (m[r.kind] || 0) + 1), m), {});
if (process.argv.includes("--md")) {
  console.log("# Error inventory (dev split)\n\n" + Object.entries(by).map(([k, v]) => `- ${k}: ${v}`).join("\n") + "\n\n| Kind | Chat | Message | Expected | Actual | Why |\n|---|---|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.kind} | ${r.chat} | ${r.message.replace(/\|/g, "/")} | ${r.expected} | ${r.actual} | ${r.why || ""} |`);
} else { console.log(by); console.table(rows); }
