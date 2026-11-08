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


## Schema v2 (annotation guide v1.1.1)

The v2 scorer implements the metrics in the annotation guide. It is **additive**: the legacy scorer, the default
`npm run bench` output, the ratchet and the baseline are unchanged, and the dev split is byte-for-byte the same.
`npm run bench:v2` prints the extra report (with 95% clustered-bootstrap intervals) after the usual output.

New `.chat` attributes (all optional; old files parse as before):

| Where | Attribute | Meaning |
| --- | --- | --- |
| task | `class=confirmed\|possible\|none` | Exclusive classification. `none` marks a near-miss that is not a task (documentation; any extraction there is already a false positive). `level=possible` still works. |
| task | `owner=Name \| - \| ~` | Known person, unknown, or ambiguous **between people**. |
| task | `tid=C014-T003`, `basis=named\|accepted\|self\|reassigned\|none` | Stable ID and owner basis (recorded; not scored). |
| task | `text="send the report"` | Anchors a task inside a message. **Required on every task in a message that holds two or more**, so pairing is by wording, not position. The scorer reports unanchored messages. |
| task | `end=open\|in_progress\|delayed\|blocked\|completed\|cancelled` | End state. `status=` still works. |
| task | `cond=pending\|satisfied\|rejected\|revoked\|ambiguous` | Condition state. |
| message | `ev type=<event> link=<task id>\|unknown\|ambiguous\|none` | A lifecycle event on a task. **An event is never a task.** Events: acknowledged, reassigned, started, delayed, blocked, unblocked, resumed, completed, cancelled. |
| `@chat` | `events=full` | The event list for this chat is complete, so predicted events that are not listed count as false positives. Without it, event precision is not scored for the chat. |

`assigned` is the creation of an owned task and is scored through the task's owner, not as an event. Revoked
conditions are expressible in gold; the extractor has no `revoked` state yet, so they show as mismatches.

Unsupported values (event types, `end=`, `cond=`, `class=`, `basis=`, links to unknown tasks) are rejected by the
loader with file and line. `assigned` is not an event type.

Matching is a deterministic **maximum-cardinality, maximum-weight one-to-one assignment** across all compatible
gold/prediction pairs. A prediction must be on one of the gold task's messages and, when the gold gives `text=`, its
source span must overlap that text or its wording must be similar. Among assignments with the same maximum number of
matches, the scorer prefers an exact normalized full-owner match, then source-span overlap, then closer wording, then
earlier predictions. Owner identity compares the complete NFC-normalized, case-insensitive name; sharing only a first
token does not make two people equivalent. An unmatched prediction is a **duplicate** only when it
restates a matched prediction (same span or similar wording) on the same message; any other unmatched prediction is a
false positive, even on a message that holds a gold task. **Precision counts duplicates** (matched / all findings); the
duplicate-free figure is reported separately for comparison with the legacy scorer. Strict compares
confirmed predictions with confirmed gold; lenient compares confirmed plus possible with both. In strict mode, a
possible gold candidate is excluded individually; it does not hide unrelated confirmed predictions on the same
message from false-positive scoring.

Owner metrics (counts and denominators are always shown): wrong-owner assignments (known gold owner, different
person named), fabricated-owner assignments (gold owner unknown or ambiguous, anyone named), correct abstention,
missed owner, owner accuracy, and unsupported owner proposals (an owner on an unmatched prediction, or a name that
does not appear in the chat). Deadlines: precision is correct deadlines over all predicted deadlines (a wrong date, a spurious date and a date on an
unmatched prediction all count against it); recall is correct deadlines over gold deadlines. Events are matched one-to-one by
event type and source message; one predicted event cannot satisfy multiple gold events. Detection (type and message) and
linking (which task) are scored independently, so a correctly detected event whose gold link is ambiguous is a detected
event and any task the extractor attached to it is a fabricated link. A predicted event's link is scored only against its
matched gold event, not by borrowing a different event's task link from the same message. Event precision needs
`@chat events=full`. Owner support is checked by exact Unicode-aware whole-word match ("Ann" is not supported by
"planning"). Link accuracy covers events attached to the right task, with correct abstention when the gold link is ambiguous. Bootstrap (every rate metric, 21 in total): 10,000 whole-chat resamples, fixed seed 20261108, zero-denominator resamples
excluded and counted, interval reported "unavailable" above 5% excluded.

`tests/adversarial/` holds the safety suite (no names, injection text, a name mentioned but not assigned, spoofed
speaker, and hostile model output: invented owner, invented quote, unsupported deadline, lifecycle overwrite). It
tests properties, not accuracy, and is separate from any blind set. A multi-line message whose continuation line
itself starts like an export header is indistinguishable from a new message in the file format; only inline spoofing
is covered.
