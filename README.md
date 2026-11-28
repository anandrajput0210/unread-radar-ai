# Unread Radar AI

**Turn a long chat export into an evidence-linked catch-up brief, locally in your browser.**

> Live demo: <to be added by owner>
>
> **English sample follow-up preview**
>
> ![English sample follow-up message preview with Maria as the confirmed owner](docs/images/brief.png)
>
> **Why panel expanded**
>
> ![Why panel for a possible unassigned task with its source message highlighted](docs/images/why-panel.png)
>
> **Abstention without a guessed owner**
>
> ![Same-first-name trap task remains unassigned with the ambiguous-owner explanation](docs/images/abstention.png)

## What it does

Unread Radar AI reads pasted or exported text conversations and surfaces candidate tasks, possible owners, timing, lifecycle updates, decisions, and exact source quotations. It is designed to help a person catch up on a conversation while keeping uncertain interpretations visible.

The deterministic rules engine runs by default. Optional Qwen analysis runs on-device through WebLLM only after the user opts in; it requires compatible WebGPU hardware and downloads model weights to browser-managed storage. Neither mode sends chat text to a cloud AI service.

## Why use it

- Inspect the original message behind a finding.
- Keep extraction outcome separate from your review decision and reported conversation status.
- Avoid guessing an owner when assignment is ambiguous.
- Group open tasks by selected chat participant in the catch-up brief.
- Distinguish an explicit past deadline from conversation evidence: the brief reports when no completion message appears in the chat.

## Try it in 30 seconds

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite and choose **Run 60-second demo** for a one-click, rules-only walkthrough. It loads a synthetic conversation, opens the summary, selects its first task, and expands the evidence and explanation. Or choose **Load English and analyze** or **Load Hinglish and analyze** to inspect a sample. Sample text is synthetic and included for demonstration; do not paste conversations you are not authorized to analyze.

## Example

Input:

```text
[14:05, 14/10/2024] Alex Johnson: They are in the shared drive. Maria, please update the executive deck with these requests by Friday 5 PM.
[14:06, 14/10/2024] Maria Garcia: Sure, I will update it.
```

Current rules-only output:

| Candidate | Owner | Timing | Conversation status |
|---|---|---|---|
| update the executive deck with these requests by Friday 5 PM | Maria | Friday, 5 PM | Acknowledged |

Evidence shown on the task:

> `[14:05, 14/10/2024] Alex Johnson: They are in the shared drive. Maria, please update the executive deck with these requests by Friday 5 PM.`

This is an illustrative result from a small authored sample, not a claim about real-world accuracy.

## How it works

```mermaid
flowchart LR
  A[Paste or import chat] --> B[Parse messages]
  B --> C[Create source snapshot]
  C --> D[Deterministic extraction]
  D --> E[Validate exact evidence references]
  F[Optional user opt-in] --> G[WebGPU / WebLLM Qwen]
  G --> H[Validate structured response]
  E --> I[Merge grounded findings]
  H --> I
  I --> J[Human review and lifecycle views]
  J --> K[Local brief and export]
```

Rules-only mode does not initialize WebLLM. The optional model can suggest candidates, but deterministic findings remain authoritative and model-provided owners or dates are not accepted without source support.

## Development and checks

Requirements: Node.js 20 or newer and npm.

```powershell
npm ci
npm test
npm run bench:v2
npm run build
npm run dev
```

The benchmark is a **synthetic regression suite** for checking code changes. Run `npm run bench:v2` to exercise it. Its results do not estimate performance on real conversations.

## Limitations

- The rules engine is pattern-based and may not recognize some tasks or may leave owners and dates unknown.
- Owner is left unknown when a name matches more than one chat participant.
- Exact quotation validity proves that text exists at a source location; it does not prove that the interpretation is correct.
- A chat’s silence does not establish whether a task was completed.
- The catch-up brief only says “assigned” when its owner match and participant identity checks pass; assignment alone does not imply someone is awaiting an update.
- Optional local AI requires compatible WebGPU hardware. Model download/loading/inference can fail; fallback uses rules-only findings and has narrower coverage.
- Inputs are limited to 60,000 characters for interactive analysis. Raw chat text and full source snapshots are not saved by the app; analysis and review data can persist across reloads only when the user opts in.
- No real-world independent labelled evaluation set is included. Real-world accuracy remains unvalidated.

## Privacy and authorization

Conversation parsing and analysis run in the browser. Review the source and verify each interpretation before relying on it. Use only chat exports you are authorized to process. Do not commit private chats or holdout data.

Saving analysis is off by default. When enabled, the app stores up to five analysis records in this browser's `localStorage`: extracted results (including quoted evidence), review decisions and task statuses, selected identity, a source fingerprint, message fingerprints/ranges, and save/schema metadata. It does not store raw chat text or the full source snapshot, and it does not sync data to another device. `localStorage` is not encrypted; data is accessible to this site's scripts and people or software with access to the browser profile. Turning saving off stops new writes but does not delete prior records; use **Clear saved data** to remove all records written by this feature. Clearing is not a guarantee of forensic erasure. Storage failures leave the analysis available in memory.

## Project documentation

- [Catch-up brief behavior and safety rules](docs/catch-up-brief.md)
- [Local AI and analysis modes](docs/local-ai.md)
- [Optional local persistence](docs/persistence.md)
- [Benchmark protocol](docs/benchmark.md)
- [Annotation and independent holdout workflow](benchmark/README.md)
- [Deployment and release checks](docs/deployment.md)

## License

MIT. See [LICENSE](LICENSE).
