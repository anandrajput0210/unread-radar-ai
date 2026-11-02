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
4. Findings are normalized and merged with deterministic local extraction rules. For common chat formats, the rules also resolve explicit named addressees (for example, “Maria, please update…”), retain unassigned generic requests, attach deadline signals from the same message, and link an acknowledgement such as “I’m on it” only when exactly one prior assignment matches the speaker. Model-only findings without an exact source reference remain unverified.
5. If WebGPU adapter/device initialization is unavailable, the app runs a clearly labelled rules-only fallback. Its coverage is limited to configured local patterns and is not equivalent to language-model analysis.
6. Up to three results are cached in memory only. Raw text, snapshots, excerpts and findings are not persisted by the application. The app removes only its legacy `unread-radar-ai:analysis-results:v2` session-storage entry and reports failures; model assets remain separate. User-triggered downloads and clipboard copies are explicit exports outside in-memory retention.
7. Recognizable message headers produce snapshot-local message records. Otherwise the entire input is one opaque source message with unknown author/timestamp and reduced message-level granularity.

## Task review workflow

- Every extracted task begins in `Needs review`; model output is a candidate, not an approved commitment.
- A reviewer can mark each item `Confirmed`, `In progress`, `Completed`, or `Rejected` and filter by urgency or review status.
- When a finding has an exact validated source span, `Show original in chat` selects that span in the imported text for manual inspection. Linked acknowledgements have their own source reference and navigation control.
- Review statuses are held in React memory for the current page session. They are not synchronized, persisted, or shared between devices.
- The executive brief and copy output include the current task review status and linked acknowledgement evidence where available.

## Runtime notes

- First initialization needs network access to download model assets and may take longer than later use.
- Inference latency varies with browser, GPU/WebGPU support, hardware, and input length.
- The same exact source snapshot can reuse an in-memory result until the source changes, results are cleared, or the page is closed. Editing the chat creates a new snapshot.
- No API key is needed. Chat text is not sent to a hosted chat-completion API by the local analysis flow.
- Review extracted tasks, owners, dates, and urgency against the original conversation. A valid exact quotation proves only that the reference points to the source; semantic support remains unverified. Local model and rule-based output are not guaranteed to be complete.

## Validation

Run `npm test` and `npm run build` before committing. The regression suite includes the six-message demo conversation: the generic feature-request question stays unassigned; Maria owns the deck update due Friday at 5 PM; Mike owns the hotel-pricing request due Monday; Mike’s “I’m on it” is linked as an acknowledgement, not extracted as another task. It also checks that a generic offer to help is not mistaken for an assignment and ambiguous acknowledgements are not guessed. Verify the first-load path and an exact repeat analysis in a WebGPU-compatible browser, then test the deployed HTTPS site separately.


## Analysis provenance

The summary is deterministic and source-grounded. When the status shows **Qwen inference completed**, WebLLM returned a valid structured response for every analyzed segment and those findings were merged with local rule findings. When it shows **Rules-only**, no successful Qwen inference was recorded. A loaded WebGPU runtime alone is not treated as proof of a successful inference request.

## Priority view

Priority counts are task-first. Signals with the same recognized source message as a task are shown as supporting context, not double-counted as separate priority items. Signals without a safe source-message link remain standalone.
