import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSplit } from "../../benchmark/lib/loadCases.mjs";
import { scoreSplit } from "../../benchmark/lib/score.mjs";

// A ratchet, not an accuracy claim: it fails if a change makes the extractor worse
// on the labelled chats. Raise the baselines (npm run bench:save) when accuracy improves.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseline = (name) => JSON.parse(fs.readFileSync(path.join(root, "benchmark", "baseline", name), "utf8"));

for (const [split, file] of [["dev", "dev-after.json"], ["holdout", "holdout-after.json"]]) {
  const hasData = fs.existsSync(path.join(root, "benchmark", "data", split)) && fs.readdirSync(path.join(root, "benchmark", "data", split)).some((f) => f.endsWith(".chat"));
  // The sealed holdout is kept OUT of the public repo (see .gitignore); without it this check is skipped.
  test(`${split} split does not regress against the recorded baseline`, { skip: !hasData && "no local " + split + " data" }, async () => {
    const now = await scoreSplit(loadSplit(root, split));
    const before = baseline(file);
    for (const mode of ["strict", "lenient"]) {
      for (const metric of ["precision", "recall", "ownerAccuracy", "deadlineAccuracy", "lifecycleAccuracy"]) {
        const a = now[mode].overall[metric], b = before[mode].overall[metric];
        if (b === null) continue;
        assert.ok(a !== null && a >= b - 0.05, `${split}/${mode} ${metric} fell from ${b}% to ${a}%`);
      }
      // Integrity metrics are absolute, not relative: a broken source reference is never acceptable,
      // and the duplicate rate may not rise.
      assert.equal(now[mode].overall.evidenceValidity, 100, `${split}/${mode} has an invalid evidence reference`);
      assert.ok(now[mode].overall.duplicateRate <= (before[mode].overall.duplicateRate ?? 0) + 0.5, `${split}/${mode} duplicate rate rose`);
      assert.ok(now[mode].overall.falsePositives <= before[mode].overall.falsePositives, `${split}/${mode} produced more false tasks`);
    }
  });
}

test("every available benchmark chat parses and has at least one message", () => {
  // The private holdout is git-ignored, so a clean checkout has only the dev split.
  const splits = ["dev", "holdout"].filter((split) => fs.existsSync(path.join(root, "benchmark", "data", split)));
  for (const split of splits) {
    for (const chat of loadSplit(root, split)) {
      assert.ok(chat.messages.length > 0, chat.id);
      for (const g of chat.goldTasks) assert.ok(g.msgs.every((i) => i < chat.messages.length), `${chat.id}/${g.id}`);
    }
  }
});
