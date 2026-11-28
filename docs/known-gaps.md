# Known gaps

- **Exact-name precedence:** when chat participants are named exactly `Ravi` and `Ravi S`, a
  request addressed to `Ravi` currently resolves to the exact-name speaker. The regression test
  `an exact participant name wins over a longer name sharing its token` records this behavior.
- **Vague ownership disputes:** an anaphoric competing commitment such as “I'll take it” is only
  linked as a dispute when it directly follows one owned task. If another message or another task
  intervenes, the engine does not infer which work the commitment refers to; review that exchange.
- **Repeated identical requests:** identical text from the same owner remains one task. Later
  occurrences are retained as source-backed supporting evidence, not separate task records.
