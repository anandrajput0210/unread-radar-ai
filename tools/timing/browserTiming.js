import { MODEL_ID, analyzeTextLocally, analyzeTextWithRules, checkWebGPUCompatibility, loadLocalModel } from "../../src/lib/ai/localAiEngine.js";
import { INPUTS } from "./inputs.js";

const logEl = document.getElementById("log");
const copyBtn = document.getElementById("copy");
let lastJson = "";
const log = (m) => { logEl.textContent += `\n${m}`; };
const ms = (t0) => +(performance.now() - t0).toFixed(1);
const REPEATS = 3;

async function environment() {
  let adapter = null;
  try {
    const a = await navigator.gpu?.requestAdapter();
    const info = a?.info || (await a?.requestAdapterInfo?.()) || {};
    adapter = { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description };
  } catch (e) { adapter = { error: String(e) }; }
  return {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    webgpu: Boolean(navigator.gpu),
    adapter,
    modelId: MODEL_ID,
  };
}

async function run() {
  logEl.textContent = "Running...";
  const report = { startedAt: new Date().toISOString(), environment: await environment() };

  // 1. Rules-only, in the browser (median of 20, warm-up excluded).
  report.rulesOnly = {};
  for (const [name, text] of Object.entries(INPUTS)) {
    await analyzeTextWithRules(text);
    const times = [];
    for (let i = 0; i < 20; i += 1) { const t0 = performance.now(); await analyzeTextWithRules(text); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    report.rulesOnly[name] = { chars: text.length, medianMs: +times[10].toFixed(2) };
  }
  log("rules-only done");

  const compat = await checkWebGPUCompatibility();
  report.webgpuCompatible = compat;
  if (!compat.supported) { finish(report, "WebGPU not usable: model timings skipped."); return; }

  // 2. Cache state decides the label: cold = weights not in the browser cache yet.
  const webllmT0 = performance.now();
  const webllm = await import("@mlc-ai/web-llm");
  report.dynamicImportMs = ms(webllmT0);
  let cached = null;
  try { cached = await webllm.hasModelInCache(MODEL_ID); } catch { /* label stays unknown */ }
  report.weightsCachedBeforeRun = cached;
  report.runLabel = cached === true ? "warm (weights cached)" : cached === false ? "cold (weights downloaded this run)" : "unknown";
  log(`import ${report.dynamicImportMs} ms; ${report.runLabel}`);

  // 3. Engine initialisation (the module import is already cached, so this excludes it).
  const initT0 = performance.now();
  await loadLocalModel(() => {});
  report.engineInitMs = ms(initT0);
  log(`engine init ${report.engineInitMs} ms`);

  // 4. Inference through the real analysis path. First call includes shader/pipeline warm-up.
  report.inference = {};
  for (const [name, text] of Object.entries(INPUTS)) {
    const runs = [];
    for (let i = 0; i < REPEATS; i += 1) {
      const t0 = performance.now();
      const result = await analyzeTextLocally(text, () => {}, { forceFresh: true });
      runs.push({ ms: ms(t0), segments: result.modelExecution?.segmentsCompleted ?? null, actions: result.actions.length });
      log(`inference ${name} run ${i + 1}: ${runs[i].ms} ms`);
    }
    report.inference[name] = { chars: text.length, runs, firstRunMs: runs[0].ms, laterRunsMedianMs: runs.slice(1).map((r) => r.ms).sort((a, b) => a - b)[Math.floor((runs.length - 1) / 2)] };
  }
  finish(report, "Done.");
}

function finish(report, message) {
  lastJson = JSON.stringify(report, null, 2);
  logEl.textContent = `${message}\n\n${lastJson}`;
  copyBtn.disabled = false;
}

document.getElementById("run").onclick = () => run().catch((e) => { logEl.textContent = `Failed: ${e?.stack || e}`; });
copyBtn.onclick = () => navigator.clipboard.writeText(lastJson);
document.getElementById("clear").onclick = async () => {
  const webllm = await import("@mlc-ai/web-llm");
  await webllm.deleteModelAllInfoInCache(MODEL_ID);
  log("Model cache cleared. Reload the page before the next cold run.");
};
