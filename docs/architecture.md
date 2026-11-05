# Architecture

Unread Radar AI runs entirely in the browser. Data flows in one direction:

```
 pasted text / .txt / .log
          │
          ▼
  lib/import        chatExportParser → sourceSnapshot
  (dialect, messages, warnings, stable offsets and hashes)
          │
          ▼
  lib/extraction    deterministic rules: tasks, owners, deadlines, Hinglish,
  (pure, no DOM)    conditions, lifecycle, decisions, summary
          │
          ├──────────────► lib/ai   WebLLM (optional, WebGPU) proposes candidates
          │                         merged under strict evidence rules
          ▼
  lib/validation    every finding gets an exact source-span reference
          │
          ▼
  lib/views         priority view · review-status workflow · grounded summary
          │
          ▼
  components + App  rendering, filters, review status, export (lib/export)
```

## Dependency rules

1. `lib/extraction`, `lib/import`, `lib/validation`, `lib/views`, `lib/export` are **pure**: no React, no DOM, no network. They are testable with `node --test`.
2. `lib/ai` may import from `lib/extraction`, `lib/import`, `lib/validation`, `lib/views`; never the reverse.
3. `components/` and `App.jsx` may import from `lib/`; `lib/` never imports from `components/`.
4. Inside `lib/extraction` the module graph is acyclic (see below). Import from `extraction/index.js` outside the folder.

## `lib/extraction` module map

| Module | Responsibility |
|---|---|
| `constants.js` | Word lists, verb list, shared regex sources |
| `text.js` | Line records, spans, negation checks, urgency |
| `dates.js` | Calendar parsing, WhatsApp timestamps, relative-date resolution |
| `records.js` | Speaker/body parsing and message records |
| `timing.js` | Deadline and timing-signal extraction |
| `mentions.js` | `@mention` extraction |
| `candidates.js` | Task candidates: addressed, self-commitment, bullets, Hinglish, relay, overdue |
| `matching.js` | Owner/speaker matching, relation scoring, supporting details |
| `conditions.js` | Prerequisites and their resolution across speakers |
| `lifecycle.js` | assigned → acknowledged → in progress → delayed → done/cancelled/reassigned |
| `actions.js` | Orchestrates candidates, conditions, lifecycle into task records |
| `summary.js` | Source-grounded summary lines |
| `analyze.js` | `analyzeConversations`, the single entry point |
| `index.js` | Public API |

Dependency order (each module only imports from those above it):
`constants → text → dates → records → timing / mentions / candidates / matching / conditions → lifecycle → actions → summary → analyze`.

## Where to add things

| I want to… | Edit |
|---|---|
| Recognise a new request phrase or language | `extraction/constants.js` (word lists), `extraction/candidates.js` |
| Support a new chat-export format | `import/chatExportParser.js` |
| Resolve a new kind of date phrase | `extraction/dates.js`, `extraction/timing.js` |
| Add a lifecycle event | `extraction/lifecycle.js` |
| Change the Markdown brief | `export/report.js` |
| Add or change UI | `components/` (keep `App.jsx` for state and layout) |

Every behaviour change needs a test in `tests/unit` (pure logic) or `tests/integration` (through the analysis engine and fixtures). Add the failing example to a fixture first.

## Tests

| Folder | Contents |
|---|---|
| `tests/unit` | One module at a time, no model |
| `tests/integration` | Full analysis engine, fixtures, cross-message accuracy, WebLLM compatibility |
| `tests/benchmark` | Synthetic regression corpus (not a real-world accuracy score) |
| `tests/fixtures` | Chats and expected outcomes |
