# Unread Radar AI

Unread Radar AI is a privacy-first conversation triage web app built with React, Vite, Tailwind CSS, WebLLM, and Qwen 2.5. It turns pasted conversation text or exported `.txt`/`.log` files into a reviewable summary of candidate tasks, mentions, deadlines/time references, decisions, and urgent messages.

## Features

- Browser-based local inference through WebLLM and WebGPU; no hosted chat-completion API is required.
- Hybrid analysis: language-model output is combined with conservative local rules for common task, mention, urgency, and date patterns.
- Drag-and-drop or local `.txt` / `.log` upload (up to 5 MB per file).
- Action-item tracking, urgency filtering, and Markdown executive-brief export.
- Progress/error feedback and testable normalization of model output.
- A cache of up to three recent analysis results for the current tab session. Cache keys are SHA-256 hashes of the model ID and input text; the original input text is not copied into the cache. Cached results can contain extracted evidence or snippets, so close the tab to clear the session cache.

## Tech stack

- React 18, Vite 5, JavaScript
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

Conversation inference runs in the browser. The app does not send pasted chat text to a hosted chat-completion API. Model assets are downloaded from their hosting location on first use. Up to three analysis results are held in `sessionStorage` for the current tab session to speed repeated analysis; those results can contain extracted chat snippets. Closing the tab clears session storage. Use only conversations you are authorized to process and review extracted findings before acting on them.

WebGPU support and performance vary by browser and hardware. A production build passing does not guarantee that model inference will work on every device. Model outputs and rule-based extractions may be incomplete or mistaken; verify tasks, owners, urgency, and time references against the original chat. Relative dates such as “today” are not converted into calendar dates unless the source provides enough context.

## Project links

- GitHub: https://github.com/anandrajput0210/unread-radar-ai
- Production deployment: https://unread-radar-ai-six.vercel.app/

## Suggested manual QA

1. Analyze a short chat with one explicit task, one direct `@mention`, and one deadline.
2. Include a decision and a negated statement such as “we do not need to redesign this today”; it should not become a task or false deadline.
3. Re-analyze the exact same input. The session cache should make this repeat much faster, including after a page refresh in the same tab if the same text is pasted back.
4. Verify the task owner and date against the source before exporting the Markdown report.
