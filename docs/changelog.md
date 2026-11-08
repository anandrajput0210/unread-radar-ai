# Changelog

## Explicit WebLLM opt-in and rules-only default — 2026-11-07

- Rules-only analysis is now the default and does not request WebGPU, import WebLLM, or download model assets.
- Added an explicit opt-in control for on-device Qwen analysis. Checking the control does not initialize the runtime; initialization begins only after the user clicks Analyze.
- Centralized analysis-mode routing and retained the existing WebGPU adapter/device fallback to deterministic rules.
- Added regression tests for default rules-only routing, no WebGPU request in rules-only mode, unavailable-WebGPU fallback, and rejection of unknown modes.
- Added positive owner tests for the names `May` and `Will`.
- Removed stale root-level patch/checksum artifacts and corrected the repository README.

# Local build changes

This working copy keeps the existing browser-local WebLLM architecture. It does not add Emergent Universal LLM Key, Gemini API, a hosted inference endpoint, or a backend API.

## Changes in this pass

- Added a human-review workflow for action candidates: `Needs review`, `Confirmed`, `In progress`, `Completed`, and `Rejected`.
- New findings default to `Needs review`; AI extraction is not treated as user approval.
- Added review-status counts and a status filter alongside urgency filtering.
- Added `Show original in chat` for tasks with an exact validated evidence reference.
- Added explicit named-addressee parsing, such as `Maria, please update...` and `Mike, can you look into...`, without assigning unrelated mentions or the speaker as owner.
- Generic requests such as `Can you send over the latest feature requests?` remain unassigned when no recipient is stated.
- Captures clock-time signals alongside weekday signals, e.g. `Friday, 5 PM`. Relative dates are preserved as phrases; no calendar date is inferred.
- Links short acknowledgements such as `I'm on it` to a prior task only when one unambiguous prior assignee matches the speaker. Ambiguous first-name matches are left unlinked. The acknowledgement has its own validated source reference.
- Avoids presenting deterministic rule matches as a fabricated numeric model-confidence score.
- Labels the summary tab `Catch-up summary` because that panel is produced from deterministic source-grounded checks rather than the model's free-form summary.
- Included regression tests for the six-message demo exchange, explicit owners, deadlines, acknowledgement links, generic offers to help, and ambiguous acknowledgement handling.

## Validation (latest update)

- `node --test`: 75 tests passed, 0 failed, including 20 separate synthetic conversation regression fixtures and priority aggregation tests.
- TypeScript's parser accepted every `.js` and `.jsx` file under `src/` with no syntax diagnostics.
- `npm run build`: not verified in this environment; `npm ci` timed out and did not finish installing Vite/React dependencies. The user previously completed a production build of the prior package, but this UI revision still needs a fresh local build.
- Browser WebGPU inference was not exercised here. The app now marks Qwen inference complete only after each segment's response is parsed and normalized; automated tests verify the completion-record logic using a test engine, not the real browser model/runtime.
- The 20 examples are synthetic regression fixtures. They are not a real-world accuracy benchmark. Follow `docs/benchmark.md` to build a consented, human-labelled evaluation set before making accuracy claims.

## Run locally

Extract the ZIP into a new folder. Open the folder that directly contains `package.json`, `index.html`, `src/`, and `tests/`. Then run:

```powershell
npm ci
npm test
npm run build
npm run dev
```

No Emergent Universal LLM Key is needed for this local-inference code path. Chat content is not sent to a hosted AI inference API; inference runs in the browser when WebGPU is supported. The rules-only fallback has narrower coverage and is not equivalent to model analysis.

## Priority view and inference audit (2026-11-01)

- Replaced the alert-count-based urgency matrix with a task-first priority view. A recognized task counts once; deadlines, urgency markers and mentions from the same recognized source message appear as supporting context. Signals without a defensible source-message link remain standalone and are not guessed onto a task.
- Changed the dashboard's total alert metric to unique priority items, with task candidates and standalone signal groups shown separately.
- Added post-inference execution metadata only after each WebLLM segment returns a valid structured response. The UI and exported brief distinguish successful Qwen inference from rules-only analysis; the catch-up summary itself remains explicitly described as deterministic.
- Added 20 synthetic conversation regression fixtures plus priority-view tests. These test deterministic parser behaviour; they are not represented as real-world accuracy measurements.

## Accuracy hardening pass — cross-conversation regression set

- Expanded task verbs and first-person commitment detection for examples such as `I'll inspect`, `I'll upload`, `I can own`, `I'll rotate`, and `I'll contact`.
- Added self-commitment owner resolution from the message speaker, while keeping generic requests such as `Can someone send...` unassigned.
- Refined cross-message task support: follow-up details can be attached to an existing task when the addressee and task relationship are unambiguous; later self-commitments/acknowledgements can be linked with their own exact source reference.
- Captures task conditions such as `once the client responds` and preserves them separately from deadlines.
- Narrows decision detection so `Legal approved the wording` is not treated as a decision announcement; explicit `Decision:` / `Agreed decision:` phrasing remains a decision.
- Excludes meeting-time phrases such as `the rollback review is scheduled for 5 PM` from deadline signals.
- Makes task candidates from deterministic rules authoritative. A model-only suggestion is shown only when its evidence is a unique exact source substring; model-suggested owner, urgency, confidence, and non-literal date are discarded. Model-only suggestions remain clearly unverified.
- Displays self-commitment, conditional task text, and exact source-backed related context in the task UI and Markdown export.
- Added exact evidence-reference integration tests for all three unfamiliar chat fixtures, including primary task, acknowledgement, and supporting-context references.
- Added a hallucination guard test proving that a model-only suggestion cannot inject an unsupported owner or calendar date.

## Latest automated validation

- `npm test`: **82 tests passed, 0 failed** (including the 20-case synthetic regression corpus, the three cross-conversation accuracy fixtures, and exact evidence-reference integration tests).
- The latest `npm run build` could not be completed in this workspace: `npm ci` timed out and left Vite unavailable. The updated UI therefore still requires a fresh local production build on the user's Windows machine.
- Real-world semantic accuracy is not established by the synthetic fixtures. They are fixed regression tests only. Browser WebGPU inference still needs to be exercised on the target device; tests use an injected engine where noted.
- Added task conditions and validated supporting-message quotations to the Action Items view, Priority view, and Markdown export so users can inspect why a follow-up was associated with a task.
- Labels first-person work as `Self-commitment` rather than implying that another person explicitly assigned it.
- Expanded automated tests to **82 total**. All primary task, acknowledgement and support-message references in the three cross-conversation fixtures are checked against the exact source snapshot.
- Added a test proving a model-only suggestion cannot contribute an unsupported owner, urgency, confidence score, or calendar date.

## Conditional state resolution — 2026-11-01

- Added explicit condition states: `reported_satisfied`, `reported_rejected`, `pending_verification`, and `ambiguous`.
- Condition states are resolved across later conversation messages after a prior blocking statement, rather than inspecting only the message that contains the eventual task commitment.
- A prerequisite can be reported satisfied even when the approval message arrives after the task commitment; the approval/rejection message is attached as its own exact source-backed supporting detail.
- Contradictory approval and rejection reports are marked `ambiguous`, not resolved by guessing which one is correct.
- Future/hypothetical phrases such as `once Legal approves the wording` cannot satisfy the prerequisite. Negated approval statements are not treated as approval evidence.
- Preserved the distinction between a satisfied prerequisite and task completion. Legal approval unblocks a supplier-contact task; it does not prove the supplier was contacted.
- Propagated `conditionStatus` through the analysis adapter, Action Items view, Priority view, and Markdown export. The UI now labels the resolution evidence separately from the original blocking condition.
- Added tests for later satisfaction, explicit rejection, contradictory evidence, pending hypothetical wording, and valid exact source references through the analysis adapter.

## Latest validation after conditional-state work

- `npm test`: **88 passed, 0 failed**.
- TypeScript parser accepted `src/App.jsx` and `src/main.jsx` as JSX with no parse diagnostics; `node --check` passed for modified JavaScript modules and tests.
- `npm run build`: not verified here. The environment's dependency install timed out and the Vite executable was unavailable. Run a fresh `npm ci` and `npm run build` locally on Windows.


## Condition chronology and dual-role summary — 2026-11-01

- The source-grounded catch-up summary now explicitly allows a message to have two supported roles. When the same source message reports that a prerequisite is satisfied and contains a concrete task commitment, it is labelled `Dual-role line (condition reported satisfied + task commitment)` rather than being forced into only one category.
- Explicit later correction/revocation language (for example `Correction: the approval was revoked`) supersedes an earlier approval/rejection state. The earlier state is retained as `condition-resolution:superseded:<state>` evidence; the latest explicit override determines the current reported condition.
- Plain contradictory approval/rejection messages without an explicit correction/revocation continue to resolve as `ambiguous`. This avoids choosing a winner based only on message order.
- The Action Items context panel labels superseded approvals/rejections distinctly and keeps the original and later resolution messages separately source-linked.
- Added regression tests for dual-role summary classification, explicit later revocation, unchanged ambiguous conflicts, and adapter propagation of final/superseded evidence with exact references.

## Latest automated validation

- `npm test`: **91 passed, 0 failed** after adding the adapter-level revocation test.
- Production build remains unverified in this workspace: `npm ci --prefer-offline --no-audit --no-fund` timed out. Run `npm ci`, `npm test`, and `npm run build` locally before deploying.


## Cross-speaker condition resolution and visual readability update

- Condition evidence is evaluated across all recognized speakers, not only the task owner. This supports Legal/Compliance/QA messages that report a prerequisite state.
- Added recognition for the exact observed wording `approval is withdrawn` and `the wording has not been approved`.
- Explicit later corrections/revocations supersede earlier approvals while retaining the earlier approval as superseded source evidence.
- Contradictory approval and not-approved statements from different participants remain ambiguous and retain both source references.
- Added parser and local-analysis-adapter regression tests for both browser-reproduced scenarios.
- Increased the smallest interface labels/metadata from 9–11 px to 11–12 px (Tailwind `text-xs`) for readability.
- Refined task and priority cards with more spacing, clearer borders, stronger but restrained shadows, and hover states. Evidence and related-context panels have more padding and clearer separation.
- This update preserves the existing React/Vite + browser-local WebLLM architecture; it does not add a hosted AI API.
