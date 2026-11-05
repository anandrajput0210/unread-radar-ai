# Conditional task state guide

Unread Radar AI separates a task's prerequisite state from the task's own review/completion state.

## Condition states

| State | Meaning |
|---|---|
| `reported_satisfied` | A later source message explicitly reports that the prerequisite was met. |
| `reported_rejected` | A later source message explicitly reports that the prerequisite was rejected, denied, failed, withdrawn, or revoked. |
| `pending_verification` | No explicit resolution evidence was found. |
| `ambiguous` | The conversation contains both satisfaction and rejection evidence. |

## Example

```text
[09:00] Chris Wong: I won't contact the supplier until Legal approves the wording.
[09:10] Chris Wong: I'll contact the supplier tomorrow morning.
[09:15] Legal: Legal approved the wording.
```

Expected result: Chris owns the supplier-contact task; the prerequisite is `reported_satisfied`; the initial blocking statement and later approval message are separate supporting references. The task itself remains a candidate for human review and is not marked completed.

## Important safeguards

- `I'll contact the supplier once Legal approves the wording` is hypothetical/future wording and must remain `pending_verification`.
- `Legal rejected the wording` yields `reported_rejected`.
- If the conversation reports both approval and rejection without an explicit correction or revocation, status is `ambiguous`.
- An explicit later correction/revocation (for example, `Correction: the approval was revoked`) supersedes the earlier state. The earlier message remains visible as superseded evidence; the latest explicit state determines the condition status.
- The condition-resolution message must have its own exact, valid source reference.
- Condition status is not task completion, user confirmation, or semantic certainty. Review the original messages before acting.

## Local verification

```powershell
npm ci
npm test
npm run build
npm run dev
```

The test suite includes regression cases for each of the four condition states, a later-revocation case, unresolved contradictory reports, and checks that both final and superseded evidence survive the analysis adapter with valid source references.


## Cross-speaker approval evidence

Condition resolution scans later recognized conversation messages across participants. The task owner does not need to be the same person who reports the approval state. A later explicit correction such as `Correction: approval is withdrawn` supersedes an earlier approval. An independent contradictory report such as `The wording has not been approved` conflicts with an earlier approval and leaves the status ambiguous unless a clear correction/revocation is present.

The app keeps both the current and superseded/conflicting messages as exact source evidence. These are reported conversation states, not external verification of the Legal/Compliance decision.
