#!/usr/bin/env node
// Usage: node benchmark/score.mjs [dev|holdout] [--json] [--verbose]
//        node benchmark/score.mjs --save   (re-record the ratchet baselines for BOTH splits)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSplit } from "./lib/loadCases.mjs";
import { scoreSplit } from "./lib/score.mjs";
import { scoreSplitV2 } from "./lib/scoreV2.mjs";

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

// Schema-v2 report (opt-in; the default output above is unchanged).
if (process.argv.includes("--v2")) {
  const v2 = scoreSplitV2(chats);
  const p = (r) => (r.value === null ? "n/a" : `${(r.value * 100).toFixed(1)}% (${r.n}/${r.d})`);
  const ci = (iv) => (iv?.ci95 ? `[${(iv.ci95[0] * 100).toFixed(1)}%, ${(iv.ci95[1] * 100).toFixed(1)}%]` : "unavailable");
  for (const mode of ["strict", "lenient"]) {
    const s = v2[mode].summary, iv = v2[mode].intervals;
    console.log(`\nSCHEMA V2 · ${mode.toUpperCase()} (95% clustered-bootstrap CI over chats, ${iv.recall.resamples} resamples, seed ${iv.recall.seed})`);
    const rows = [
      ["Task precision (duplicates count)", s.precision, iv.precision],
      ["Task precision (excluding duplicates)", s.precisionExcludingDuplicates, iv.precisionExcludingDuplicates],
      ["Task recall", s.recall, iv.recall],
      ["Duplicate rate", s.duplicateRate, iv.duplicateRate],
      ["False positives per conversation", s.falsePositivesPerChat, iv.falsePositivesPerChat, "mean"],
      ["Conversations with false positives", s.chatsWithFalsePositive, iv.chatsWithFalsePositive],
      ["Owner accuracy", s.owner.ownerAccuracy, iv.ownerAccuracy],
      ["Wrong-owner assignments", s.owner.wrongOwnerAssignments, iv.wrongOwnerRate],
      ["Missed owner", s.owner.missedOwner, iv.missedOwnerRate],
      ["Fabricated-owner assignments", s.owner.fabricatedOwnerAssignments, iv.fabricatedOwnerRate],
      ["Correct owner abstention", s.owner.correctAbstention, iv.correctAbstentionRate],
      ["Classification accuracy", s.classification.accuracy, iv.classificationAccuracy],
      ["Deadline precision", s.deadline.precision, iv.deadlinePrecision],
      ["Deadline recall", s.deadline.recall, iv.deadlineRecall],
      ["End-state accuracy", s.endStateAccuracy, iv.endStateAccuracy],
      ["Condition-state accuracy", s.conditionStateAccuracy, iv.conditionStateAccuracy],
      ["Task-link accuracy", s.link.accuracy, iv.linkAccuracy],
      ["Correct link abstention", s.link.correctAbstention, iv.linkAbstentionRate],
      ["Lifecycle-event recall", s.events.recall, iv.eventRecall],
      ["Lifecycle-event precision", s.events.precision, iv.eventPrecision],
      ["Events linked to the right task", s.events.linkedRecall, iv.eventLinkedRecall],
    ];
    for (const [label, metric, interval, kind] of rows) {
      if (kind === "mean") {
        const value = metric.value === null ? "n/a" : `${metric.value.toFixed(3)} findings/chat (${metric.n}/${metric.d})`;
        const bounds = interval?.ci95
          ? `[${interval.ci95[0].toFixed(3)}, ${interval.ci95[1].toFixed(3)}] findings/chat`
          : "unavailable";
        console.log(`  ${label.padEnd(38)} ${value.padEnd(30)} 95% CI ${bounds}`);
      } else {
        console.log(`  ${label.padEnd(38)} ${p(metric).padEnd(18)} 95% CI ${ci(interval)}`);
      }
    }
    console.log(`  False-positive findings: ${s.falsePositives} · duplicate findings: ${s.duplicates} · mean FP/chat: ${s.meanFalsePositivesPerChat?.toFixed(3)}`);
    console.log(`  Negative controls: ${s.negativeControls.chats} chats · ${s.negativeControls.falsePositives} false positives · ${s.negativeControls.chatsWithFalsePositive} chats affected`);
    console.log(`  unsupported owner proposals: ${s.owner.unsupportedOwnerProposals.onUnmatchedPredictions} on unmatched predictions, ${s.owner.unsupportedOwnerProposals.notInSource} not in source`);
    console.log(`  Wrong dates: ${s.deadline.wrongDate} · spurious dates: ${s.deadline.spurious} · deadlines on unmatched findings: ${s.deadline.onUnmatchedPredictions}`);
    console.log(`  Wrong links: ${s.link.wrongLink} · missed links: ${s.link.missedLink} · fabricated links: ${s.link.fabricatedLink} · unmatched predicted events: ${s.events.unmatchedPredicted}`);
    console.log(`  annotation health: ${s.annotationHealth.unanchoredMultiTaskMessages} message(s) hold several gold tasks without text= (positional pairing only)`);
  }
}
