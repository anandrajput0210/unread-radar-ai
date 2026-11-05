# Conversation regression corpus

`tests/fixtures/conversation-benchmark.json` contains 20 **synthetic** conversation snippets with expected extraction outcomes. They are automated regression fixtures, not a measured accuracy study and not a substitute for consented, representative, human-labelled conversations.

Coverage includes explicit named assignments, addressed questions, unassigned requests and actions, explicit and contextual due signals, calendar-only references, negation, offers to help, acknowledgement-only messages, group requests, multiple addressees, urgency, decisions, direct handles, unrelated mentions, action labels, duplicate requests, and speaker/owner separation.

Run the corpus with:

```powershell
npm test
```

The test runner reports each fixture separately. A pass means the parser met the stated expectation for that synthetic example only. It does not establish general precision, recall, semantic correctness, or Qwen quality.

## Human benchmark needed before public launch

For a meaningful accuracy benchmark, collect at least 20 representative conversations that the team is authorized to analyze. Have two reviewers independently label each action, owner, deadline type (explicit/contextual/absent), acknowledgement, urgency, and source message. Resolve disagreements before comparing the application output. Report per-field precision/recall and the number of ambiguous cases; do not collapse all outcomes into one accuracy percentage.

## Cross-conversation regression chats

The test suite also contains three longer fixtures in `tests/fixtures/`:

- `accuracy-chat-1-product-launch.txt`: a named assignment and acknowledgement, a first-person offer/commitment, a vendor quote request and confirmation, a negated FAQ action, and a conditional launch decision.
- `accuracy-chat-2-incident-response.txt`: first-person incident commitments, a detail request attached to a prior task, a second assignee's task and acknowledgement, a negated production restart, and a meeting time that must not be mistaken for a task deadline.
- `accuracy-chat-3-meeting-followups.txt`: an unassigned proposal request, a self-assigned training task, a conditional tracker update, a supplier action gated on Legal approval, and a separate training-mode decision.

These fixtures are now part of `npm test`. The parser expectations include task text, owner, deadline status, acknowledgement, condition, and decision separation. A pass means these exact cases meet their assertions; it is not a measured accuracy score for unseen conversations.

The application intentionally treats exact source-reference validity separately from semantic correctness. A source quote can be exact while the interpretation remains wrong. Review every candidate before acting on it.

## What is tested at the source-reference layer

The cross-conversation integration tests also pass the three fixture chats through the local rules-only engine and validate each primary task quotation, acknowledgement quotation, and attached supporting-context quotation against the corresponding source snapshot. This checks that the displayed references point to exact source spans. It still does not prove that the linked task interpretation is semantically right.

A separate injected-model test verifies a safety rule: if a model proposes a task from a unique exact quotation but also proposes an owner and calendar date that are not grounded in the quoted source, the application discards those unsupported owner/date claims and presents the suggestion as low-priority and unverified.

## Milestone D
See `benchmark/README.md`. Dev now has 40+ chats and a fresh sealed holdout (24 chats, incl. no-task cases) covering English,
Hinglish, Devanagari, collective, negation, deadlines, lifecycle and ambiguity. Collective
statements live in `src/lib/extraction/collective.js`.
