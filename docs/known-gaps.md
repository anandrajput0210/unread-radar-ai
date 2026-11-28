# Known gaps

- **Exact-name precedence:** when chat participants are named exactly `Ravi` and `Ravi S`, a
  request addressed to `Ravi` currently resolves to the exact-name speaker. The regression test
  `an exact participant name wins over a longer name sharing its token` records this behavior.
