# Known gaps

No currently tracked known gaps.

## Fixed gaps

- **Same-first-name addressee ambiguity — fixed in `e66b3f7`:** the `same-first-name` trap chat
  contains two speakers named Ravi and the instruction “Ravi, please check the draft invoice for
  errors.” Phase 5 documented that rules-only extraction emitted owner `Ravi` as a confirmed
  assignment and kept the regression test skipped. The fix leaves the owner unknown when more than
  one chat participant matches.
