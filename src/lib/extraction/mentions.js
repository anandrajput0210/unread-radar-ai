import { MENTION_REGEX, SPECIAL_MENTIONS } from "./constants.js";
import { conversationMessageRecords } from "./records.js";
import { sourceSpan, uniqueBy } from "./text.js";

export function extractMentions(text, options = {}) {
  const matches = [];

  for (const record of conversationMessageRecords(text, options)) {
    const line = record.text;
    const regex = new RegExp(MENTION_REGEX.source, "gu");
    let match;

    while ((match = regex.exec(line)) !== null) {
      const handle = match[2];
      if (handle && !SPECIAL_MENTIONS.has(handle.toLowerCase())) {
        matches.push({
          handle,
          line,
          sourceSpan: sourceSpan(record),
        });
      }
      if (match[0].length === 0) regex.lastIndex += 1;
    }
  }

  return uniqueBy(matches, (item) => `${item.handle.toLowerCase()}|${item.line.toLowerCase()}`);
}
