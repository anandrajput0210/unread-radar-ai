# Cross-chat accuracy hardening report

This report records parser outcomes for the three synthetic, previously failing conversation fixtures. It is not a real-world accuracy score.

## Product launch

- Daniel Kim: upload revised screenshots to shared folder by Thursday 4 PM. Owner resolves to Daniel; deadline is explicit; Daniel's acknowledgement/refinement is attached as its own source reference.
- Elena Ruiz: review the pricing section after lunch. Recognised as a first-person self-commitment owned by Elena.
- Priya Nair: confirm vendor quote before tomorrow's stand-up. Owner resolves to Priya; relative deadline is retained; Priya's confirmation is attached as context.
- The negated old-FAQ instruction is not extracted as a task.
- The launch-page publication statement remains a decision, not a task/deadline.

## Incident response

- Raj Mehta: inspect logs and post the likely cause by 3 PM. Owner resolves to Raj; deadline is explicit. Nina's endpoint request and Raj's log-excerpt update are attached as supporting context.
- Sam Brooks: rotate the staging API secret before the 8 PM maintenance window. Owner resolves to Sam; deadline is explicit; Sam's acknowledgement is linked.
- The instruction not to restart production does not create a task.
- The rollback review scheduled for 5 PM is excluded as a meeting time, not a task deadline.

## Meeting follow-ups

- Revised proposal request: remains unassigned; Friday is retained as the request's explicit timing.
- Bella Martin: own the training schedule and send two date options by Wednesday noon. Owner resolves to Bella; deadline is explicit.
- Bella: update the tracker once the client responds. The condition is preserved, and Bella's later confirmation is attached as supporting context.
- Chris Wong: contact the supplier and share the delivery estimate tomorrow morning. Owner resolves to Chris; timing is explicit. The earlier blocked statement (`I won't contact the supplier until Legal approves the wording`) is linked as context; the later message reports Legal approval, so the condition is labelled `reported_satisfied`.
- The remote-training decision remains separate from tasks; the no-room-booking statement does not create a task.

## Evidence and safety checks

- Every task's primary evidence, acknowledgement evidence, and attached supporting context is validated against the exact source snapshot in automated integration tests.
- Model-only suggestions require a unique exact source quotation. Suggested owners, urgency, confidence values, and dates not literally supported by that quotation are discarded. Remaining model-only suggestions stay unverified.

## Validation status

- Automated tests: 88 passed, 0 failed.
- `node --check` passed for JavaScript source and tests.
- TypeScript compiler JSX parse check passed for `src/App.jsx` (no type-check claim is made).
- Production build: not verified in this environment. `npm ci` timed out and Vite was unavailable. Run `npm ci`, `npm test`, and `npm run build` on the local Windows machine before deploying.
- Runtime WebGPU/Qwen inference: not verified on this package in this environment. Confirm locally in the target browser. A validated JSON response does not establish semantic correctness.

## Scope note

The three chats and the 20-case parser corpus are synthetic regression fixtures. They demonstrate fixed behaviour on those examples only; they do not establish accuracy on arbitrary WhatsApp or workplace conversations. Continue human review before acting on extracted tasks.

## Conditional state refinement

The Legal prerequisite now has four explicit outcomes:

- `reported_satisfied`: a later message reports Legal/QA approval or equivalent evidence.
- `reported_rejected`: a later message explicitly reports rejection/denial/failure.
- `pending_verification`: no resolution evidence is present. A future hypothetical such as `once Legal approves` does not resolve it.
- `ambiguous`: both satisfaction and rejection evidence appear in the conversation.

The resolution message is attached as a supporting detail with an exact source reference. The original blocking statement remains separately attached. A satisfied condition does not imply that the downstream task was completed.

Automated validation now includes four condition-state paths and a local analysis-adapter test that checks the resolved status and source reference survive into the UI data model.


## Dual-role decision/condition summary and revocation handling

- A message that reports Legal approval and makes a supplier-contact commitment is now represented in the source-grounded summary as a dual-role line: condition update plus task commitment. The formal remote-training decision remains a separate decision-pattern line.
- A later explicit revocation/correction supersedes an earlier approval while preserving both pieces of evidence; an ordinary contradiction without explicit correction remains `ambiguous`.
- Adapter tests validate that the earlier approval and later revocation both survive with exact, valid source references.
