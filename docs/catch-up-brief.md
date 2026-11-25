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
- The brief says **“Past due · no completion message found in this chat.”** This is not a claim that work was missed; completion may have occurred outside the conversation.
- Completion and cancellation are lifecycle outcomes. User review status is separate.
- A missing or ambiguous deadline is not converted into a calendar date.

## Source evidence

Task source links navigate to the exact source quotation when the reference matches the current source snapshot. A valid quotation establishes reference integrity, not semantic correctness; review the surrounding conversation before acting.
