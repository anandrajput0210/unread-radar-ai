#!/usr/bin/env node
// Usage: node benchmark/score.mjs [dev|holdout] [--json] [--verbose]
//        node benchmark/score.mjs --save   (re-record the ratchet baselines for BOTH splits)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSplit } from "./lib/loadCases.mjs";
import { scoreSplit } from "./lib/score.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.includes("--save")) {
  for (const name of ["dev", "holdout"]) {
    const r = await scoreSplit(loadSplit(root, name));
    const slim = (m) => ({ overall: m.overall, categories: m.categories });
    fs.writeFileSync(path.join(root, "benchmark/baseline", `${name}-after.json`), JSON.stringify({ strict: slim(r.strict), lenient: slim(r.lenient) }, null, 2) + "\n");
    console.log(`saved ${name}-after.json`);
  }
  process.exit(0);
}
const split = process.argv.find((a) => a === "dev" || a === "holdout") || "dev";
if (!fs.existsSync(path.join(root, "benchmark/data", split))) { console.error(`No ${split} data in benchmark/data/${split}/. The sealed holdout is not stored in the repo.`); process.exit(1); }
const chats = loadSplit(root, split);
const res = await scoreSplit(chats);
const f = (v) => (v === null ? "  n/a" : String(v).padStart(5) + "%");
console.log(`\nSplit: ${split} · ${chats.length} chats · ${chats.reduce((a, c) => a + c.messages.length, 0)} messages · ${chats.reduce((a, c) => a + c.goldTasks.length, 0)} gold tasks`);
console.log("(strict = Confirmed tasks only; lenient = Confirmed + Possible-review tasks)\n");
for (const mode of ["strict", "lenient"]) {
  const o = res[mode].overall;
  console.log(`${mode.toUpperCase().padEnd(8)} precision ${f(o.precision)}  recall ${f(o.recall)}  owner ${f(o.ownerAccuracy)}  deadline ${f(o.deadlineAccuracy)}  lifecycle ${f(o.lifecycleAccuracy)}  evidence ${f(o.evidenceValidity)}  dup-rate ${f(o.duplicateRate)}  | FP ${o.falsePositives}  dup ${o.duplicates}  wrong-owner-assigned ${o.ownerFalseAssignments}  spurious-deadline ${o.spuriousDeadlines}`);
}
console.log("\nBy category (lenient):");
for (const [cat, s] of Object.entries(res.lenient.categories).sort()) {
  const st = res.strict.categories[cat];
  console.log(`  ${cat.padEnd(15)} tasks ${String(s.goldTasks).padStart(2)}  recall strict ${f(st.recall)} lenient ${f(s.recall)}  precision strict ${f(st.precision)} lenient ${f(s.precision)}`);
}
if (process.argv.includes("--verbose")) {
  console.log("\nMISSED (lenient):"); res.lenient._detail.misses.forEach((m) => console.log("  -", m));
  console.log("\nFALSE POSITIVES (lenient):"); res.lenient._detail.falsePos.forEach((m) => console.log("  -", m));
  console.log("\nFALSE POSITIVES (strict):"); res.strict._detail.falsePos.forEach((m) => console.log("  -", m));
}
if (process.argv.includes("--json")) {
  const slim = (m) => ({ overall: m.overall, categories: m.categories });
  const file = path.join(root, "benchmark", "results", `${split}.json`);
  fs.writeFileSync(file, JSON.stringify({ split, strict: slim(res.strict), lenient: slim(res.lenient) }, null, 2) + "\n");
  console.log("\nwrote", path.relative(root, file));
}
