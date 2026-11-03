# Task lifecycle extraction

Unread Radar now adds a conversation-derived lifecycle to each deterministic task candidate. This is separate from the user's manual review state (`needs-review`, `confirmed`, `in-progress`, `completed`, `rejected`) stored by the UI.

## Current lifecycle fields

Each rule-extracted task contains:

- `lifecycleStatus`: `open`, `assigned`, `acknowledged`, `in-progress`, `delayed`, `blocked`, `reassigned`, `completed`, or `cancelled`. An `unblocked` event returns a blocked task to `assigned` (or `open` if it has no owner); it is only applied to a task that is currently blocked.
- `lifecycleEvents`: ordered conversation events. Each event includes `type`, `actor`, the original message `text`, `sourceSpan`, and a parsed message date/timestamp when available.
- `completed` and `cancelled`: compatibility booleans derived from the lifecycle state.
- `resolvedDueDate`: the latest resolved due date when a delay update contains a recognizable new date.
- `owner`: updated when a clear, uniquely matched reassignment is detected.

The rules-only analysis adapter preserves these fields and adds snapshot-bound evidence references to lifecycle events. Event source spans point to the complete original message record (including its WhatsApp header); the event `text` is the parsed message body.

## Supported event signals

- **Acknowledged:** exact short acknowledgements such as `on it`, `I'm on it`, `I am on it`, `got it`, and `will do`, when an owner/task match is unique.
- **In progress:** phrases such as `working on`, `started working on`, `in progress`, and `currently handling`.
- **Delayed:** phrases such as `delayed until Monday`, `pushing to Friday`, or `kal tak` in a delay context. A recognizable new date updates `dueDate` and `resolvedDueDate` relative to the update message date.
- **Completed:** explicit phrases such as `quotation sent`, `report submitted`, `done`, `fixed`, `ho gaya`, and `bhej diya`.
- **Cancelled:** explicit cancellation language such as `cancelled`, `no longer needed`, and supported Hinglish cancellation phrases.
- **Reassigned:** explicit transfers such as `reassign the quotation to Rahul` or `Rahul will handle the quotation`. The existing task owner is updated rather than creating a second copy for the reassignment message.

## Hinglish support (deterministic phrase rules)

- **Addressee:** `Vikram bhai, kal tak invoice bhej dena` gives owner Vikram and strips the addressee from the task text. Generic salutations (`Bhai`, `Yaar`, `Sir`) never become owners.
- **Relay:** `Neha ko bol do presentation complete kare` gives owner Neha, only when the remainder contains an action. `Rahul ko bol do meeting kal hai` (a fact) is not a task. `Sandeep ko remind kar do` does not assign Sandeep.
- **Acknowledged:** `Ok sir, kar deta hu`, `ho jayega`, `kar dunga`. A bare `Ok` is never an acknowledgement.
- **Delay cues:** `nahi bheji`, `abhi tak nahi`, `pending hai` (merged into the existing task only under the deliverable-identity rule).
- **Blocked / unblocked:** `hold pe rakho`, `on hold`, `paused` / `approval de diya`, `off hold`.
- **Reassigned:** `Banner ka kaam ab Rohan karega`. If the message also names the previous owner (`Neha ko ye nahi karna`) that is used to find the task, only when it is unique.
- **Cancellation messages** (`Cancel the logo request`) update the existing task and never create a task of their own.
- **Non-owner reports:** a first-person completion or progress report from someone other than the owner does not change the owner's task unless the message names the owner.

## Conservative matching rules

Lifecycle messages are associated with an earlier task only when their content has sufficient overlap with one task and the match is not tied with another task. Context-free messages such as `Done` are attached only when exactly one open task is owned by the speaker. If more than one task could match, no lifecycle change is made.

Acknowledgements after reassignment are evaluated against the current owner, so the new owner can acknowledge the task.

Completed and cancelled are treated as terminal states for subsequent automated event matching. The parser does not silently reopen a completed/cancelled task.

## Known limitations

This is a deterministic phrase-and-overlap engine, not general multilingual understanding. It does not reliably understand arbitrary Hindi/Hinglish phrasing, sarcasm, voice notes, quoted/forwarded status statements, or every grammatical variant. A strong word match is not proof that the interpretation is correct. Review the original evidence before acting on a lifecycle state.

The lifecycle fields are returned by the analysis engine and their event evidence appears in the existing supporting-context data. The current task card does not yet have a dedicated lifecycle-status badge/timeline; that belongs in a subsequent UI pass. The existing manual review status remains a separate user-controlled field.
