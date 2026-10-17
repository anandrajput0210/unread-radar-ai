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

1. The browser checks for WebGPU support.
2. WebLLM is dynamically imported and initializes `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` when analysis is requested.
3. Conversation chunks are sent to the local model for structured JSON findings.
4. Findings are normalized and merged with deterministic local extraction rules. These rules help recover direct mentions and common deadline/task patterns but can also misclassify edge cases.
5. Up to three completed results are cached for the current tab session. The original input text is not stored in the cache; cache results may contain extracted evidence and text snippets. Close the tab to clear this cache.

## Runtime notes

- First initialization needs network access to download model assets and may take longer than later use.
- Inference latency varies with browser, GPU/WebGPU support, hardware, and input length.
- The same exact conversation can reuse a cached result, including after a page refresh in the same tab if you paste the same text again. Editing the chat requires fresh inference.
- No API key is needed. Chat text is not sent to a hosted chat-completion API by the local analysis flow.
- Review extracted tasks, owners, dates, and urgency against the original conversation. Local model and rule-based output are not guaranteed to be complete.

## Validation

Run `npm test` and `npm run build` before committing. Verify the first-load path and an exact repeat analysis in a WebGPU-compatible browser, then test the deployed HTTPS site separately.
