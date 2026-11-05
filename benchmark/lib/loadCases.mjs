// Loads benchmark chats written in a small annotated format (see benchmark/README.md).
import fs from "node:fs";
import path from "node:path";

const pad = (n) => String(n).padStart(2, "0");

function parseAttrs(str) {
  const out = {};
  for (const m of str.matchAll(/(\w+)=("[^"]*"|\S+)/g)) out[m[1]] = m[2].replace(/^"|"$/g, "");
  return out;
}

export function parseChatFile(text, file = "") {
  const chats = [];
  let chat = null;
  let date = null;
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trimEnd();
    if (!line.trim() || line.startsWith("#")) continue;
    if (line.startsWith("@chat ")) {
      const a = parseAttrs(line.slice(6));
      const [d, m, y] = a.start.split("/").map(Number);
      date = new Date(Date.UTC(y, m - 1, d));
      chat = { id: a.id, split: a.split, cats: (a.cats || "").split(",").filter(Boolean), messages: [], gold: {} , file };
      chats.push(chat);
      continue;
    }
    if (!chat) throw new Error(`${file}:${i + 1}: message before @chat`);
    const adv = line.match(/^---\s*\+(\d+)d$/);
    if (adv) { date = new Date(date.getTime() + Number(adv[1]) * 86400000); continue; }
    const [body, annotation] = line.split(" => ");
    const m = body.match(/^(\d{2}):(\d{2}) ([^:]+): (.*)$/);
    if (!m) throw new Error(`${file}:${i + 1}: cannot parse message "${line}"`);
    const idx = chat.messages.length;
    const stamp = `[${m[1]}:${m[2]}, ${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}]`;
    chat.messages.push({ index: idx, speaker: m[3], body: m[4], line: `${stamp} ${m[3]}: ${m[4]}` });
    if (annotation) {
      for (const part of annotation.split(";")) {
        const [id, ...rest] = part.trim().split(/\s+/);
        const attrs = parseAttrs(rest.join(" "));
        const g = (chat.gold[id] ||= { id, msgs: [], owner: null, due: null, status: null, level: "confirmed" });
        g.msgs.push(idx);
        if ("owner" in attrs) g.owner = attrs.owner === "-" ? null : attrs.owner;
        if ("due" in attrs) g.due = attrs.due === "-" ? null : attrs.due;
        if ("status" in attrs) g.status = attrs.status;
        if ("level" in attrs) g.level = attrs.level;
      }
    }
  }
  for (const c of chats) {
    c.text = c.messages.map((m) => m.line).join("\n");
    let off = 0;
    for (const m of c.messages) { m.start = off; m.end = off + m.line.length; off = m.end + 1; }
    c.goldTasks = Object.values(c.gold);
  }
  return chats;
}

export function loadSplit(root, split) {
  const dir = path.join(root, "benchmark", "data", split);
  return fs.readdirSync(dir).filter((f) => f.endsWith(".chat")).sort()
    .flatMap((f) => parseChatFile(fs.readFileSync(path.join(dir, f), "utf8"), `${split}/${f}`));
}
