# Catch-up brief

The catch-up brief is a display-only view over extracted action items. It groups tasks by ownership after the reader selects who they are in the chat. It does not change task extraction, assign owners, or infer that someone is waiting.

## Identity and assignment

- A task appears under **Assigned to you** only if its owner matches the selected identity and that person is a speaker in the source chat.
- A partial name that could refer to multiple participants appears under **Might be you**.
- If the selected identity is not in the chat, no task is presented as theirs.
- Possible tasks remain in **Needs a human look** and are not treated as assigned tasks.
- An owner is evidence of assignment only; it is not evidence that the owner is waiting.

## Deadlines and lifecycle

- Past-due status requires an explicit deadline resolved to a valid ISO calendar date, earlier than the selected “as of” date, and an open lifecycle state.
- The brief says **“Past due · no completion message found in this chat.”** Completion may have occurred outside the conversation.
- Completion and cancellation are lifecycle outcomes. User review status is separate.
- A missing or ambiguous deadline is not converted into a calendar date.

## Source evidence

Task source links navigate to the exact source quotation when the reference matches the current source snapshot. A valid quotation establishes reference integrity, not semantic correctness; review the surrounding conversation before acting.

## Why this task?

Each task card can expand a display-only explanation built from the extracted task and its existing source references:

- The owner basis distinguishes a named request, a speaker's own commitment or acceptance, an implied addressee, an unknown owner, and an ambiguous name. Unknown and ambiguous owners are not resolved to a speaker by the panel.
- Timing shows the extracted phrase and any already-resolved date. Contextual timing is explicitly labelled **inferred from context**.
- The timeline starts with the source-backed request and includes only lifecycle events already present on the task. Events are not inferred by the panel.
- Evidence quotes and source-reference validity are shown separately from task meaning and human review status. Possible tasks remain labelled as possible.
- Selecting a task or its evidence opens the conversation source pane beside the task list. It displays the current source snapshot without reparsing it, and highlights a message only when its reference is valid for that snapshot. Otherwise, it says **“Source reference could not be verified”** and highlights nothing.
