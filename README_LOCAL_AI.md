# Unread Radar AI — Local AI

This repository uses WebLLM to run Qwen 2.5 inference in the browser. It does not use `window.ai` and does not require a hosted chat-completion API.

## Setup

```powershell
npm install
npm test
npm run build
npm run dev
```

## Current analysis pipeline

1. The browser checks for the WebGPU adapter API, then performs a narrow adapter/device compatibility check when analysis is requested.
2. When WebGPU is usable, WebLLM is dynamically imported and initializes `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`.
3. Conversation chunks are sent to the local model for structured JSON candidate findings.
4. Findings are normalized and merged with deterministic local extraction rules. Model-only findings without an exact source reference remain unverified.
5. If WebGPU adapter/device initialization is unavailable, the app runs a clearly labelled rules-only fallback. Its coverage is limited to configured local patterns and is not equivalent to language-model analysis.
6. Up to three results are cached in memory only. Raw text, snapshots, excerpts and findings are not persisted by the application. The app removes only its legacy `unread-radar-ai:analysis-results:v2` session-storage entry and reports failures; model assets remain separate. User-triggered downloads and clipboard copies are explicit exports outside in-memory retention.
7. Recognizable message headers produce snapshot-local message records. Otherwise the entire input is one opaque source message with unknown author/timestamp and reduced message-level granularity.

## Runtime notes

- First initialization needs network access to download model assets and may take longer than later use.
- Inference latency varies with browser, GPU/WebGPU support, hardware, and input length.
- The same exact source snapshot can reuse an in-memory result until the source changes, results are cleared, or the page is closed. Editing the chat creates a new snapshot.
- No API key is needed. Chat text is not sent to a hosted chat-completion API by the local analysis flow.
- Review extracted tasks, owners, dates, and urgency against the original conversation. A valid exact quotation proves only that the reference points to the source; semantic support remains unverified. Local model and rule-based output are not guaranteed to be complete.

## Validation

Run `npm test` and `npm run build` before committing. Verify the first-load path and an exact repeat analysis in a WebGPU-compatible browser, then test the deployed HTTPS site separately.
