# Known gaps

- **Same-first-name addressee ambiguity:** the `same-first-name` trap chat contains two speakers
  named Ravi and the instruction “Ravi, please check the draft invoice for errors.” Rules-only
  extraction currently emits the owner as `Ravi` with a confirmed assigned-task classification.
  The instruction does not identify which Ravi, so this is not a safe individual assignment.
  This Phase 5 demo records the behavior as a skipped test and does not change extraction rules.
