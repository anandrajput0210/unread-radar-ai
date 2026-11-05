import test from "node:test";
import assert from "node:assert/strict";
import { resolveDeadlineDate } from "../../src/lib/extraction/dates.js";

// 2026-11-04 is a Wednesday.
const WED = "2026-11-04";

test("'next <weekday>' lands on the named weekday in the following week", () => {
  assert.equal(resolveDeadlineDate("next monday", WED), "2026-11-09");
  assert.equal(resolveDeadlineDate("next friday", WED), "2026-11-13");
  assert.equal(resolveDeadlineDate("next wednesday", WED), "2026-11-11");
  assert.equal(resolveDeadlineDate("next monday", "2026-11-02"), "2026-11-09");
});

test("a plain weekday resolves to its next occurrence", () => {
  assert.equal(resolveDeadlineDate("friday", WED), "2026-11-06");
  assert.equal(resolveDeadlineDate("wednesday", WED), WED);
});

test("end-of-day, Hinglish and Hindi-script deadlines resolve", () => {
  assert.equal(resolveDeadlineDate("eod", WED), WED);
  assert.equal(resolveDeadlineDate("kal tak", WED), "2026-11-05");
  assert.equal(resolveDeadlineDate("kal subah tak", WED), "2026-11-05");
  assert.equal(resolveDeadlineDate("parso tak", WED), "2026-11-06");
  assert.equal(resolveDeadlineDate("कल तक", WED), "2026-11-05");
});

test("bare 'kal' stays unresolved because it can mean yesterday or tomorrow", () => {
  assert.equal(resolveDeadlineDate("kal", WED), null);
});
