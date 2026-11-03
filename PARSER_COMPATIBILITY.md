# Chat parser compatibility update

This update improves the deterministic parser used before/alongside the local model. It does not claim general multilingual understanding or a measured real-world accuracy rate.

## Supported message framing

- Android-style: `12/10/24, 2:01 pm - Priya: message`
- Bracketed style: `[14:01, 12/10/2024] Priya: message`
- Bracketed date-first style: `[12/10/24, 2:01 PM] Priya: message`
- 12-hour and 24-hour clocks, with optional seconds
- Continuation lines following a timestamped WhatsApp message are kept with that message
- The original source span is retained across multi-line messages; the timestamp and sender header are removed from the extracted task text
- Common media/deleted-message placeholders are treated as source content, not tasks by themselves

For ambiguous numeric dates (for example `10/12/24`), `analyzeConversations(text, { dateOrder: "dmy" })` defaults to day/month/year, appropriate for the initial India-first audience. Pass `{ dateOrder: "mdy" }` for month/day/year exports. Unambiguous dates are interpreted from their numeric values. The parser does not pretend it can infer an ambiguous locale from the text alone.

## Additional extraction patterns

- Hinglish action phrases currently include specific patterns such as `bhej dena`, `send kar do`, `share kar dena`, `remind kar do`, `update kar dena`, `check kar lena`, and related forms.
- Relative deadline phrases include `aaj`, `kal tak`, `tomorrow`, `yesterday`, `day after tomorrow`, and weekdays (including `next Friday`). Bare `kal` and `parso` are deliberately not resolved because they can refer to past or future days depending on context.
- Resolved dates are emitted as `resolvedDueDate` on action records and as `resolvedDates` on deadline records. Resolution uses the date in the message's exported timestamp when available; otherwise it uses the current date in the supplied `timeZone` or the device's local zone.
- Team todo assignments in forms such as `Team todo: Maria to finish the deck / Mike to book the hotel` are split into separate owner/action candidates.
- A `you were supposed to ... yesterday` follow-up can be surfaced as an overdue candidate. If a name directly precedes `you`, that name is used as the owner; otherwise ownership remains unassigned.
- An `on it` acknowledgement is linked to an unassigned task only when there is exactly one preceding unassigned candidate. Ambiguous acknowledgements remain unlinked.

## Known limits

- Hinglish support is pattern-based and partial; it is not Hindi/Hinglish language understanding.
- Ambiguous locale dates require the caller to choose `dateOrder`.
- Owner inference is intentionally conservative. It will not guess when a name or acknowledgement could refer to multiple tasks.
- Relative date resolution covers the phrases listed above; it does not resolve every natural-language date expression.
- These regression tests use authored fixtures and edge cases. They are not a substitute for a consented, manually labelled real-chat benchmark.
## Task lifecycle

See [`TASK_LIFECYCLE.md`](./TASK_LIFECYCLE.md) for conversation-derived assignment, acknowledgement, progress, delay, completion, cancellation, reassignment semantics and known limitations.

## Shared import parser (`src/lib/chatExportParser.js`)

`createSourceSnapshot` (the path the UI uses for message boundaries) now delegates to one shared parser instead of its own header regexes.

- **Dialect detection first.** `whatsapp-timestamped` (Android, iOS bracketed, ISO), `speaker-labelled` (untimestamped `Name: text`, accepted only if *every* non-empty line is a header), or `opaque`.
- **Multiline messages.** In timestamped exports only header lines start a message; other lines continue the previous one. Previously any continuation line collapsed the whole chat into one unknown-author message.
- **Classification:** system, media-omitted, deleted, forwarded and edited messages are flagged, not dropped. Unattributed leading text becomes a `preamble` record.
- **Date order** (DMY/MDY) is inferred from the data (a day > 12). If every date is ambiguous, the parser assumes DD/MM **and emits `DATE_ORDER_AMBIGUOUS`**; conflicting evidence emits `DATE_ORDER_CONFLICT`. `createSourceSnapshot(text, { dateOrder })` accepts a manual override.
- **Warnings are structured** (`snapshot.importWarnings`) and shown in the analysis status line. Lines that start with a date but match no supported header trigger `UNPARSED_HEADER_LIKE_LINES`.
- Source text is never modified; narrow no-break spaces and bidi marks are tolerated for matching only.

Extraction (`conversationParser`) now builds its message records from this same parser for timestamped exports, so evidence, extraction and lifecycle share one boundary model. System, media, deleted and preamble records are never treated as commitments. The legacy line-based path remains only for untimestamped text.

**Dates are never guessed from today.** If a message has no trustworthy date, relative deadlines (`tomorrow`, `kal tak`, weekdays) stay unresolved; only explicit calendar dates resolve. Under a `DATE_ORDER_CONFLICT`, only timestamps that are unambiguous on their own (a component > 12) resolve. Choosing a date order in the Import review panel re-runs analysis; an explicit choice is part of the snapshot identity, so cached results cannot be reused across orders.

Known gaps: non-Latin AM/PM markers (e.g. Hindi-locale exports), dot-separated clock times (`9.15 pm`), and no UI to correct individual message boundaries (only date order is correctable).

## Lifecycle: delay-with-new-date merge

A message with a blocked/delay cue (`missing`, `pending`, `waiting for`, `not ready`, ...) that re-commits with a due phrase updates the speaker's existing task to `delayed` (original deadline kept in `originalDueDate`/`originalResolvedDueDate`) instead of creating a duplicate. Identity is by deliverable, not verb: when the message names a deliverable ("the quotation"), the target must share it; when it only says "it", the speaker must have exactly one open task in total. Otherwise nothing is merged.
