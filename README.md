# Unread Radar AI

Unread Radar AI is a privacy-first conversation triage web app built with React, Vite, Tailwind CSS, WebLLM, and Qwen 2.5. It turns pasted conversation text or exported `.txt`/`.log` files into a reviewable summary of candidate tasks, mentions, deadlines/time references, decisions, and urgent messages.

## Features

- Browser-based local inference through WebLLM and WebGPU; no hosted chat-completion API is required.
- Hybrid analysis: language-model output is combined with conservative local rules for common task, mention, urgency, and date patterns.
- Drag-and-drop or local `.txt` / `.log` upload (up to 5 MB per file).
- Human review workflow for extracted tasks: needs review, confirmed, in progress, completed, or rejected; filter by urgency and review status.
- Exact source-span navigation: jump from a task candidate to the selected quotation in the original chat input. Linked acknowledgements have separate source evidence and navigation.
- Markdown executive-brief export includes human review statuses.
- Explicit addressee parsing for common request forms, conservative owner assignment, same-message deadline signals, and unambiguous acknowledgement linking.
- Progress/error feedback and testable normalization of model output.
- Snapshot-local source/message identities, preserved source order, and exact-span reference validation for rule-derived findings.
- A memory-only cache of up to three recent analysis results. Raw conversations, snapshots, excerpts, and findings are not persisted by the application.
- A clearly labelled rules-only fallback when WebGPU adapter/device initialization is unavailable.

## Tech stack

- React 18, Vite 6, JavaScript
- Tailwind CSS 4, Lucide React
- `@mlc-ai/web-llm` with `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`
- Node.js built-in test runner (`node --test`)

## Run locally

Requirements: a recent Node.js release and a current Chrome/Edge browser with WebGPU available. The first model initialization downloads model assets, so it requires network access; later use may benefit from browser caching.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (commonly `http://localhost:5173`). To verify the project:

```bash
npm test
npm run build
npm run preview
```

## Privacy and limitations

Conversation processing runs in the browser. The app does not send pasted chat text to a hosted chat-completion API. Raw conversation text, source snapshots, evidence excerpts, findings, and summaries remain memory-only by default; up to three results may be held in an in-memory cache until cleared or the page is closed. On startup, the app attempts to remove only its legacy `unread-radar-ai:analysis-results:v2` session-storage entry and reports a cleanup failure; unrelated browser storage is not deleted. Downloaded WebLLM model assets are managed separately by the browser and are not deleted by clearing conversation data. User-triggered Markdown downloads and clipboard copies are deliberate exports and are outside the app's in-memory retention boundary. Use only conversations you are authorized to process and review extracted findings before acting on them.

When recognizable speaker/message headers are absent, an import is represented as one opaque source message. Author and timestamp remain unknown, so message-level granularity is reduced. Exact quotation and message-reference validation establish source-reference integrity only; they do not prove that a task, owner, decision, or urgency interpretation is semantically correct. Such interpretations remain unverified for human review.

WebGPU support and performance vary by browser and hardware. A production build passing does not guarantee that model inference will work on every device. Model outputs and rule-based extractions may be incomplete or mistaken; verify tasks, owners, urgency, and time references against the original chat. Relative dates such as “today” are not converted into calendar dates unless the source provides enough context.

## Project links

- GitHub: https://github.com/anandrajput0210/unread-radar-ai
- Production deployment: https://unread-radar-ai-six.vercel.app/

## Suggested manual QA

1. Analyze a short chat with one explicit task, one direct `@mention`, and one deadline. The six-message regression fixture is covered by the test suite: it should resolve Maria and Mike as owners, keep the generic feature-request request unassigned, and link Mike’s acknowledgement to his one matching task.
2. Include a decision and a negated statement such as “we do not need to redesign this today”; it should not become a task or false deadline.
3. Re-analyze the exact same input before clearing it; the in-memory cache may reuse the result. Reloading or clearing the source discards conversation-derived results.
4. Use `Show original in chat` to inspect each exact quotation; a matching quotation alone does not prove the model interpreted it correctly.
5. Change the task review status, filter by that status, and confirm the exported Markdown report reflects the chosen statuses.

## Priority counting and inference transparency

The priority view is task-first: each action candidate is counted once. Deadline, urgency, and mention findings from the same recognized source message are attached as supporting context instead of inflating the priority total. Findings without a defensible source-message identity remain standalone signals; the app does not guess a relationship.

The UI and exported brief distinguish a completed browser-local WebLLM inference run from rules-only analysis. A Qwen completion record is created only after every segment returns valid structured output. The catch-up summary itself remains deterministic and source-grounded.

The project includes 20 synthetic parser regression fixtures. They validate selected behaviours but do not establish real-world accuracy. See [BENCHMARK_GUIDE.md](./BENCHMARK_GUIDE.md) for limitations and a human-labelled evaluation procedure.

## Accuracy safeguards and cross-message context

The local parser recognises named assignments, first-person commitments (for example, `I'll inspect` or `I can own`), unassigned group requests, and selected follow-up details. It can attach a reply or acknowledgement to a prior task only where the speaker/task relationship is unambiguous. Conditional language such as `once the client responds` is preserved as a condition rather than silently converted into a date.

The app treats deterministic task candidates as authoritative. A model-only suggestion is permitted only when its quoted evidence is a unique exact substring of the source. Such suggestions do not inherit a model-suggested owner, urgency, confidence value, or calendar date. They remain clearly marked for review. Deadline extraction excludes explicit meeting-time statements such as `the review is scheduled for 5 PM` and separates explicit deadlines from contextual timing. These are conservative rules, not a guarantee of general semantic understanding.

Task cards display exact primary evidence, linked acknowledgements, and related conversation context with separate source navigation. Conditions are shown in the Action Items and Priority views and included in the Markdown brief.


## Cross-speaker condition states

Prerequisites can be resolved from later messages by Legal, Compliance, QA, or other participants. Explicit revocation/correction supersedes an earlier approval; unresolved contradictions remain ambiguous. Both current and superseded statements remain linked to exact source messages. See `CONDITION_STATE_GUIDE.md`.
