// Node timing for the rules-only path. Run: node tools/timing/rulesOnly.mjs
import { performance } from "node:perf_hooks";
import { analyzeTextWithRules } from "../../src/lib/ai/localAiEngine.js";
import { INPUTS } from "./inputs.js";

const RUNS = 30;
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const out = { node: process.version, runs: RUNS, results: {} };
for (const [name, text] of Object.entries(INPUTS)) {
  await analyzeTextWithRules(text); // warm-up, excluded
  const times = [];
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    await analyzeTextWithRules(text);
    times.push(performance.now() - t0);
  }
  out.results[name] = { chars: text.length, medianMs: +median(times).toFixed(2), minMs: +Math.min(...times).toFixed(2), maxMs: +Math.max(...times).toFixed(2) };
}
console.log(JSON.stringify(out, null, 2));
