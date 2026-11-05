# Benchmark

Labelled chats in a small DSL (`benchmark/data/**/*.chat`):

    @chat id=<id> split=dev|holdout cats=a,b start=DD/MM/YYYY
    HH:MM Speaker: message text => t1 owner=Name|- due=YYYY-MM-DD|- status=<lifecycle> level=possible
    --- +1d            (advance the chat date)

A message with no `=>` is expected to produce **no task**. `level=possible` marks a suggestion/proposal:
required only in lenient scoring. `status=` is the final lifecycle status (acknowledged, completed,
delayed, cancelled, reassigned).

## Metrics (reported separately)
task precision · task recall · owner accuracy · deadline accuracy · lifecycle accuracy ·
evidence-reference validity (quote exists verbatim and sits in the task's message) · duplicate rate.
Strict = confirmed tasks only; lenient = confirmed + possible-review.

## Protocol
- `npm run bench` / `bench:verbose`: dev split. Tune against this only.
- `npm run bench:holdout`: sealed split. Run for aggregate numbers; do NOT read per-case misses and tune.
  Once a holdout's misses have been inspected it becomes dev (`legacy-holdout-burned.chat` was one).
- `npm run bench:save`: re-record ratchet baselines after a deliberate change. `npm test` fails if
  metrics fall >0.05 below baseline or false positives rise.
- Cases here are written by the project authors, not collected from real users. Synthetic results
  do not prove real-world accuracy.

## Keeping the holdout blind
`benchmark/data/holdout/` is git-ignored on purpose. A holdout that is published (or whose misses
you have read) stops being blind. Keep it in a private location, copy it in locally to run
`npm run bench:holdout`, and write a fresh one when it has been inspected. Without it, the holdout
regression check is skipped.

## Ratchet rules (`npm test`)
Precision, recall, owner, deadline and lifecycle accuracy may not fall more than 0.05 below the saved
baseline; false positives and the duplicate rate may not rise; evidence validity must be exactly 100%
(every task quote, acknowledgement, supporting-context, lifecycle-event and review-queue reference is
re-checked independently against the chat text).
