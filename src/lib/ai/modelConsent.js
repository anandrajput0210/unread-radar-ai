export const MODEL_CONFIRMATION_TEXT = "Qwen needs compatible WebGPU hardware. It downloads large model files and may slow or freeze low-memory machines. Continue?";

export function selectAnalysisMode(useLocalModel, confirmModel = globalThis.confirm) {
  if (!useLocalModel) return "rules-only";
  if (typeof confirmModel !== "function") return "rules-only";
  return confirmModel(MODEL_CONFIRMATION_TEXT) ? "local-model" : "rules-only";
}
