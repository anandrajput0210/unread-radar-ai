import { BASES, CLASSES, CONDITION_STATES, LINK_NONE, normalizeEnd, normalizeEvent } from "./vocab.mjs";
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
      chat = { id: a.id, split: a.split, cats: (a.cats || "").split(",").filter(Boolean), messages: [], gold: {}, goldEvents: [], notTasks: [], eventsComplete: a.events === "full", file };
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
        // Schema v2: an update message is annotated "ev type=acknowledged link=t1". It is an
        // event on a task, never a task of its own. link = a task id, or unknown | ambiguous | none.
        if (id === "ev") {
          const type = normalizeEvent(attrs.type);
          if (!type) throw new Error(`${file}:${i + 1}: unsupported event type "${attrs.type}" (assignment is task creation, not an event)`);
          chat.goldEvents.push({ type, msg: idx, link: attrs.link || "unknown", line: i + 1 });
          continue;
        }
        // Schema v2: "class=none" marks a near-miss that is explicitly NOT a task (documentation
        // only: any task extracted there is already an unmatched, false-positive finding).
        if ("class" in attrs && !CLASSES.includes(attrs.class)) throw new Error(`${file}:${i + 1}: unsupported class "${attrs.class}"`);
        if ("basis" in attrs && !BASES.includes(attrs.basis)) throw new Error(`${file}:${i + 1}: unsupported basis "${attrs.basis}"`);
        if ("end" in attrs && !normalizeEnd(attrs.end)) throw new Error(`${file}:${i + 1}: unsupported end state "${attrs.end}"`);
        if ("cond" in attrs && !CONDITION_STATES.includes(attrs.cond)) throw new Error(`${file}:${i + 1}: unsupported condition state "${attrs.cond}"`);
        if (attrs.class === "none") { chat.notTasks.push({ id, msg: idx }); continue; }
        const g = (chat.gold[id] ||= { id, msgs: [], owner: null, ownerKind: "unknown", due: null, status: null, level: "confirmed" });
        g.msgs.push(idx);
        if ("owner" in attrs) {
          g.owner = attrs.owner === "-" || attrs.owner === "~" ? null : attrs.owner;
          g.ownerKind = attrs.owner === "~" ? "ambiguous" : attrs.owner === "-" ? "unknown" : "known";
        }
        if ("due" in attrs) g.due = attrs.due === "-" ? null : attrs.due;
        if ("status" in attrs) g.status = attrs.status;
        if ("level" in attrs) g.level = attrs.level;
        if ("class" in attrs) g.level = attrs.class;
        if ("tid" in attrs) g.tid = attrs.tid;
        if ("basis" in attrs) g.basis = attrs.basis;
        if ("end" in attrs) g.end = normalizeEnd(attrs.end);
        if ("text" in attrs) g.text = attrs.text;
        if ("cond" in attrs) g.cond = attrs.cond;
      }
    }
  }
  for (const c of chats) {
    c.text = c.messages.map((m) => m.line).join("\n");
    let off = 0;
    for (const m of c.messages) { m.start = off; m.end = off + m.line.length; off = m.end + 1; }
    c.goldTasks = Object.values(c.gold);
    for (const e of c.goldEvents) {
      if (!LINK_NONE.has(e.link) && !c.gold[e.link]) throw new Error(`${file}:${e.line}: event links to unknown task "${e.link}" in chat ${c.id}`);
    }
  }
  return chats;
}

export function loadSplit(root, split) {
  const dir = path.join(root, "benchmark", "data", split);
  return fs.readdirSync(dir).filter((f) => f.endsWith(".chat")).sort()
    .flatMap((f) => parseChatFile(fs.readFileSync(path.join(dir, f), "utf8"), `${split}/${f}`));
}
