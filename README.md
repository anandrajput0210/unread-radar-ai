# Unread Radar AI — Milestone D.5 extraction hardening

This is a targeted source overlay for the D.4 project. It contains only the files changed by D.5; it is not a complete application ZIP.

## Included changes

- `src/lib/extraction/actions.js` — integrates conditional tasks and conservative complaint/repair linkage.
- `src/lib/extraction/candidates.js` — recognizes conditional imperative requests.
- `src/lib/extraction/conditions.js` — resolves a condition using the QA speaker label while retaining exact message evidence.
- `src/lib/extraction/implied.js` — recognizes a narrow complaint-implied remediation candidate.
- `src/lib/extraction/lifecycle.js` — links a unique, recent progress update to an eligible conditional task using the shared claim policy.
- `tests/unit/knownGaps.test.js` — replaces the four D.4 TODOs with active positive and negative regressions.
- `benchmark/data/dev/hinglish.chat` — corrects the ambiguous shared-owner annotation for “Amit tum dono dekh lo” to no single owner.
- `docs/milestone-d5-extraction-decisions.md` — records the product decisions and safety boundaries.

## Apply

1. Back up or commit your current working tree first.
2. Extract this ZIP into the repository root, preserving folders, and allow replacement of matching files.
3. Run:

```bash
npm test
npm run bench
npm run bench:inventory
npm run build
```

Do not include or replace the private blind holdout. The D.5 checks use the development split only.

## Verification from the assembled review copy

- Tests: 247 total; 246 passed, 0 failed, 1 skipped (the holdout test), 0 TODO.
- Development benchmark: strict precision 100%, strict recall 95.2%, owner accuracy 100%, deadline 100%, lifecycle 100%, evidence 100%, duplicates 0%, wrong-owner assignments 0. Lenient recall 100%.
- Benchmark inventory: no remaining rows.

These are tuned development-set results, not independent real-world accuracy estimates.

The production build could not be reproduced in the Linux review environment because the ZIP's `node_modules` contains Windows Rollup binaries and lacks `@rollup/rollup-linux-x64-gnu`. Run `npm run build` in the Windows project after applying these files; do not treat the Linux dependency error as a source-code build failure.
