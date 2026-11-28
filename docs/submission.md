# FLARE Submission

## Project description

Unread Radar AI turns chat text into a local catch-up workspace. It extracts task candidates, deadlines, lifecycle updates, decisions, and mentions, then links findings to exact source messages so people can inspect evidence. A deterministic rules engine runs by default; an optional model runs locally after explicit opt-in on compatible WebGPU hardware. The interface separates extraction from review, groups tasks by participant when identity is known, and leaves uncertain ownership unresolved rather than guessing. A follow-up builder summarizes supported owners while keeping unclear items unnamed. Synthetic English, Hinglish, and trap examples demonstrate behavior. This is a conversation-triage aid, not a source of truth. Real-world performance has not been validated; users should carefully check all interpretations against quoted context before acting.

## Two-minute demo script

- **0:00–0:20 — Start:** Click **Run 60-second demo**. Explain that this is a synthetic conversation and the app runs rules-only analysis without loading the optional model.
- **0:20–0:40 — English evidence:** Show the first assigned task, its exact request quote, and the related commitment. Explain that a displayed owner is an assignment, not a claim about anyone's current availability.
- **0:40–1:00 — Hinglish:** Find the invoice task, read its Hinglish source message, and show that the named participant's response is the basis for the owner.
- **1:00–1:20 — Abstention:** Select the project-tracker task addressed to “Ravi.” Open **Why this task?** Show “More than one person could match. Not guessing.” and point out that neither Ravi is shown as its owner.
- **1:20–1:35 — Ownership dispute:** Select the vendor-quotation task. Explain that the later commitment and acknowledgement create a conflict, so the owner is left unresolved for review.
- **1:35–1:50 — Follow-up:** Show the preview and copy action. Confirm that named owners appear only for supported tasks and unclear items have no adjacent person name.
- **1:50–2:00 — Limits:** State that the examples are synthetic, the rules cover known patterns, and performance on real conversations has not been validated. Ask viewers to inspect each source message.

## Q&A

### How is this different from ChatGPT, Slack, or WhatsApp summaries?

Unread Radar is designed to keep source messages visible and leave uncertain ownership unresolved rather than guessing. No head-to-head comparison with ChatGPT, Slack, or WhatsApp summaries has been conducted; this submission contains no output from those products and makes no comparative performance claim.

### Who uses it?

It is for people who need to review a busy conversation and inspect candidate tasks, timing, and source messages. It is a review aid; the person using it remains responsible for checking interpretations.

### Does it work on real chats?

Performance on real conversations has not been validated. The committed examples and regression suite are synthetic. Use only conversations you are authorized to process, and verify findings against their source messages.

### What is rules-based?

The default engine uses deterministic patterns and matching rules to identify candidate tasks and related evidence. It does not require the optional model. Its coverage is limited to patterns it recognizes, so unfamiliar phrasing may not produce a finding.

## Prior work

The core extraction engine predates the event. The event work in this branch is dated 2026-11-28: `e4b05f1` Fix disputed task ownership; `f8612cb` Add one-click demo experience; `f844408` Tighten first-impression privacy and comparison UI; `9038a79` Show known limits in privacy disclosure; `ad4b26c` Document deployment and lazy model bundle; and the 2026-11-28 submission-kit commit that adds this document and refreshes the README screenshots.
