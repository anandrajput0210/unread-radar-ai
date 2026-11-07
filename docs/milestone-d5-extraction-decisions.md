# Milestone D.5 — extraction decisions and guardrails

This change closes the four Milestone D.4 TODOs without relaxing the three-message ownership policy.

## 1. Shared Hinglish addressee: `Amit tum dono dekh lo`

The task is retained as a confirmed action, but its single `owner` field remains `null`. The phrase explicitly describes a two-person assignment while identifying only one member. The current data model cannot represent a shared owner set, so choosing Amit as the sole owner would overstate what the message establishes. The development annotation is corrected from `owner=Amit` to `owner=-`; this is an annotation decision, not a parser-driven metric adjustment.

## 2. Defect complaint and repair follow-up

A concrete report such as `the logo files you sent are corrupted` creates a Possible, unassigned remediation candidate (`resend logo files`). It does not infer an owner from the word `you`.

A later repair fragment such as `Sorry about that, resending now` links to that candidate only when exactly one eligible complaint exists within the shared three-message window and the original requester is identifiable and different from the responder. The response confirms the candidate and assigns the responder. Resolved complaints, stale complaints, unidentified requesters, and repair fragments without complaint context do not produce an owner claim.

A contentful commitment is blocked by an already-open task owned by the speaker only when that existing task matches the same work. Contentless promises remain ambiguous when the speaker owns any open task.

## 3. Conditional imperative

`Once QA signs off, deploy it` becomes a confirmed, unassigned task with condition `Once QA signs off` and initial condition status `pending_verification`. A later QA message such as `QA: Signed off` can satisfy the condition using the speaker label as context while keeping the original message as the exact evidence quote. Conditional questions and prohibited actions remain non-tasks.

A subsequent unique, recent progress update such as `Dev: Deploying now` can claim the deployment using the same requester identity and claim-window checks, plus a matching verb stem.

## 4. Event time versus deadline

`Can someone take the vendor call at 4?` remains a confirmed unassigned request with no deadline. `Please send the vendor report by 4 pm` retains `4 pm` as an explicit deadline.

## Verification

The active regressions live in `tests/unit/knownGaps.test.js`. The blind holdout remains excluded. Development benchmark results are synthetic/tuned and must not be presented as real-world accuracy.
