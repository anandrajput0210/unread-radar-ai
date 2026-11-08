# Phase 1 measurement and 15-chat pilot runbook

This runbook is for validating the existing implementation. It does not authorize extraction changes or use of private chats without permission.

## Gate 0 — sync and establish a clean baseline

From the local Windows repository:

```powershell
git switch main
git pull origin main
npm ci
npm test
npm run build
npm run bench:verbose
npm run bench:inventory
npm run bench:v2
git status
git log -1 --oneline
```

Do not proceed to browser measurements if tests or the production build fail. Record the final commit SHA and all command exit codes. The working tree should be clean before switching to the diagnostics branch.

## Phase 1A — separate runtime, model initialization, and inference

Use current Chrome or Edge on the HTTPS deployment or localhost with working WebGPU. Use synthetic inputs from `docs/manual-browser-tests/phase1-3-message.txt` and `phase1-50-message.txt`; do not paste private conversations for timing.

### Cold first-use run

1. Create a temporary, fresh browser profile. Do not use a profile with previously cached WebLLM model assets.
2. Open DevTools before loading the app. In Network, enable **Preserve log** and leave **Disable cache unchecked**. Clear the temporary profile's site data before starting.
3. Load the app and run the 3-message input in rules-only mode. Confirm no WebLLM runtime chunk or model-weight requests appear.
4. Keep the exact same input, explicitly enable on-device AI, and run Analyze.
5. Confirm the final state says **Qwen inference completed**. A runtime loaded message or rules-only fallback is not a successful model run.
6. Record the status-bar measurements: **import** (dynamic WebLLM runtime import), **init** (CreateMLCEngine model initialization, including any first-use model download), **inference**, and total elapsed time.
7. In Network, record the total transferred bytes for model-weight assets separately from the WebLLM runtime JavaScript chunk. Record failed requests and any cache indicators. Do not treat the runtime chunk size as the model-weight download size.

### Warm browser-cache run

1. Reload the page without clearing site data or browser cache. The opt-in checkbox should be off again by default.
2. Run the same 3-message input with on-device AI enabled.
3. Record import, init, inference, and total time again. This run measures a new page initialization with browser-cached assets where the browser actually serves them from cache.
4. Within the same page, click **Run fresh analysis (skip cache)** twice more. These runs should report **engine reused** and give inference-only timings. They must not be mistaken for a warm model download test.

### 50-message run

1. Keep the same browser profile and use `phase1-50-message.txt`.
2. Run rules-only analysis and save its task candidates, owners, deadlines, possible items, and evidence references.
3. Enable on-device AI and run the exact same input. Confirm Qwen inference completed and save the merged result.
4. Click **Run fresh analysis (skip cache)** twice. Record inference time and segment count on each run.
5. Compare the model result with rules-only output. The model path retains deterministic rule findings and can add only grounded possible suggestions; it is not allowed to supply owners or deadlines unless grounded under the existing validation rules.

### Measurement record

Record one row per run. Use milliseconds for timings and bytes for network transfer.

| Profile | Input | Mode | Messages parsed | Segments | Runtime import ms | Model init ms | Inference ms | Total ms | Model-weight bytes | Fallback/error |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Cold | 3-message | Rules-only | | 0 | n/a | n/a | n/a | | 0 | |
| Cold | 3-message | Qwen | | | | | | | | |
| Warm reload | 3-message | Qwen | | | | | | | | |
| Warm same-page | 3-message | Qwen | | | n/a | n/a | | | 0 | |
| Cold/warm | 50-message | Rules-only | | 0 | n/a | n/a | n/a | | 0 | |
| Cold/warm | 50-message | Qwen | | | | | | | | |
| Warm same-page | 50-message | Qwen | | | n/a | n/a | | | 0 | |

Run at least three fresh inference repetitions per input after initialization and report the median. Keep cold download and warm cached initialization as separate observations. Record browser version, OS, GPU model, and whether WebGPU was available; never compare timings across machines without noting the hardware.

### Accuracy comparison gate

For each input, compare the complete rules-only output with the Qwen-plus-rules output. Count:
- additional useful candidates that rules-only missed and Qwen added as possible;
- additional false positives or duplicate tasks;
- unsupported owners or dates (expected zero);
- invalid source references (must remain zero);
- acknowledgements incorrectly emitted as separate tasks;
- rules-only tasks missing from the merged result (expected zero).

A slower Qwen run is not a win by itself. Keep it opt-in unless it finds genuinely useful grounded candidates on cases rules-only misses, without increasing unsupported claims or false positives. Do not modify extraction rules while measuring.

## Phase 2 — validate the annotation guide with 15 pilot chats

The pilot tests whether the guide can be applied consistently. It is not the 60-chat blind evaluation and its results must not be advertised as independent accuracy.

### Before collecting anything

- Obtain explicit permission from every relevant participant or use conversations you are otherwise authorized to evaluate. Record the consent scope, date, and withdrawal process.
- Anonymise people, phone numbers, email addresses, companies, customer data, links, and sensitive content before annotation.
- Store raw pilot chats and labels in a private, access-controlled location outside this Git repository. Never commit chat exports, gold labels, screenshots, or identifiable examples.
- Recruit two independent annotators and a non-builder adjudicator. Annotators must not see app predictions before their independent labels are locked.

### Pilot composition

Select 15 varied conversations, not 15 easy examples. Include short and longer chats, two-person and group chats, English and Hindi/Hinglish (including Devanagari where available), explicit and ownerless requests, possible/non-task near-misses, deadlines, acknowledgements, reassignment/completion/cancellation, blocked or conditional work, and genuine no-task conversations. Do not force every category into every conversation.

### Annotation sequence

1. Assign a random code such as `PILOT-001`; keep the identity-to-code key separately from the chat and label files.
2. Each annotator independently identifies candidate messages and exact source spans before assigning stable task IDs.
3. Label each candidate using the guide's exclusive `confirmed / possible / not` classification. Record owner and owner basis separately from linked-task identity. Label deadlines, end states, condition states, lifecycle events, and exact evidence references separately.
4. Lock each annotator's labels before comparison. The adjudicator resolves disagreements and records the reason; do not silently overwrite one annotator's work.
5. Log every unclear rule, missing label, repeated disagreement, or case where two reasonable annotators interpret the guide differently.
6. Update the guide only from observed ambiguity. After 15 chats, publish/freeze guide v1.2, record the change log, and hash the guide version used for the subsequent blind set.

Pilot conversations may inform the development set after adjudication, but keep real source text and labels private. Only add newly written synthetic regression cases to Git. The 60-chat blind set must be newly collected after guide freeze; its labels and case-level misses must remain hidden from the builder until the evaluation is locked.

### Pilot exit criteria

- All 15 chats were independently annotated by both annotators.
- Candidate discovery and exact source spans were reconciled before stable task-ID matching.
- Disagreements were adjudicated with reasons.
- Guide ambiguities and resulting changes are recorded.
- Guide v1.2 is frozen before any blind-set annotation begins.
- Consent, anonymisation, private storage, and access controls are documented.

Do not start the 60-chat blind set until these conditions are satisfied.
