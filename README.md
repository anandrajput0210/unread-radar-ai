# Unread Radar AI

Unread Radar AI is a browser-local conversation review tool. It extracts candidate tasks, owners, timing signals, lifecycle updates, and source evidence from pasted or exported chat logs. The deterministic rules pipeline is the default. The optional WebLLM/Qwen model path is only initialized after the user explicitly enables on-device AI and starts an analysis.

## Run locally

```bash
npm ci
npm test
npm run build
npm run dev
```

## Important constraints

- Rules-only mode works without WebGPU and does not load the WebLLM runtime.
- Optional model inference runs in the browser and requires compatible WebGPU hardware. The first opted-in run downloads model assets into browser-managed cache.
- Extracted tasks and interpretations require human review. Exact source-reference validity does not prove semantic correctness.
- Conversation text, snapshots, and findings are held in page memory only; do not commit real chat exports or private evaluation data.
- The committed synthetic benchmark is a regression suite, not evidence of production accuracy.

## Project documentation

- [Local AI and analysis modes](docs/local-ai.md)
- [Benchmark protocol](docs/benchmark.md)
- [Deployment and release checks](docs/deployment.md)
