/**
 * Benchmark scoring: pure functions, no I/O.
 *
 * Ground truth is per message. A message is a gold positive when it carries a
 * real commitment/request (label `task`) or an under-specified one (`vague`).
 * Extraction output is read from two lists:
 *   - confirmed: analysis.actions
 *   - queue:     analysis.reviewQueue (possible / needs-context items); optional
 */

const LABELS = new Set(["task", "vague"]);

export function parseDataset(text) {
  const chats = [];
  let chat = null;
  for (const raw of String(text).split(/\r?\n/u)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const header = line.match(/^#\s*chat:\s*([^|]+)\|\s*lang:\s*([^|]+)\|\s*date:\s*(\d{4}-\d{2}-\d{2})/u);
    if (header) {
      chat = { id: header[1].trim(), lang: header[2].trim(), date: header[3], messages: [] };
      chats.push(chat);
      continue;
    }
    if (line.startsWith("#") || !chat) continue;
    const [bodyPart, labelPart] = line.split(/\s+=>\s+/u);
    const sep = bodyPart.indexOf(": ");
    if (sep < 0) throw new Error(`Benchmark line without "Speaker: text": ${line}`);
    const message = { speaker: bodyPart.slice(0, sep), text: bodyPart.slice(sep + 2).trim(), label: null, owner: undefined, due: undefined, kind: null };
    if (labelPart) {
      const [label, ...attrs] = labelPart.trim().split(/\s+/u);
      if (!LABELS.has(label)) throw new Error(`Unknown label "${label}" in: ${line}`);
      message.label = label;
      for (const attr of attrs) {
        const [key, value] = [attr.slice(0, attr.indexOf("=")), attr.slice(attr.indexOf("=") + 1)];
        if (key === "owner") message.owner = value === "none" ? null : value;
        else if (key === "due") message.due = value;
        else if (key === "kind") message.kind = value;
        else throw new Error(`Unknown attribute "${key}" in: ${line}`);
      }
    }
    chat.messages.push(message);
  }
  return chats;
}

/** Renders a chat as a WhatsApp-iOS style export, one line per message. */
export function renderChat(chat) {
  const [y, m, d] = chat.date.split("-");
  const lines = [];
  const starts = [];
  let offset = 0;
  chat.messages.forEach((message, index) => {
    const minutes = 10 * 60 + index * 3;
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    const line = `[${hh}:${mm}, ${d}/${m}/${y}] ${message.speaker}: ${message.text}`;
    starts.push(offset);
    lines.push(line);
    offset += line.length + 1;
  });
  return { text: lines.join("\n"), starts, lines };
}

function messageIndexAt(starts, lines, offset) {
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    if (offset >= starts[i] && offset <= starts[i] + lines[i].length) return i;
  }
  return -1;
}

function nameKey(value) {
  return String(value ?? "").replace(/^@/u, "").trim().split(/\s+/u)[0].toLocaleLowerCase();
}

const ratio = (num, den) => (den === 0 ? null : num / den);
const f1 = (p, r) => (p === null || r === null || p + r === 0 ? null : (2 * p * r) / (p + r));

function emptyCounts() {
  return { tp: 0, fp: 0, fn: 0 };
}

function summarize(c) {
  const precision = ratio(c.tp, c.tp + c.fp);
  const recall = ratio(c.tp, c.tp + c.fn);
  return { ...c, precision, recall, f1: f1(precision, recall) };
}

/**
 * Scores extraction against gold labels.
 * @param chats parsed dataset
 * @param analyze (text) => { actions, reviewQueue? }
 */
export function scoreChats(chats, analyze) {
  const confirmed = emptyCounts();
  const combined = emptyCounts();
  const slices = {};
  const sliceOf = (key) => (slices[key] ||= { confirmed: emptyCounts(), combined: emptyCounts() });
  const owner = { correct: 0, total: 0 };
  const deadline = { correct: 0, total: 0 };
  const queue = { items: 0, real: 0 };
  const misses = [];
  const falseAlarms = [];
  const queueNoise = [];
  let messages = 0;
  let goldPositives = 0;

  for (const chat of chats) {
    const rendered = renderChat(chat);
    const result = analyze(rendered.text);
    const actionAt = new Map();
    for (const action of result.actions || []) {
      const index = messageIndexAt(rendered.starts, rendered.lines, action.sourceSpan?.startOffset ?? -1);
      if (index >= 0 && !actionAt.has(index)) actionAt.set(index, []);
      if (index >= 0) actionAt.get(index).push(action);
    }
    const queueAt = new Map();
    for (const item of result.reviewQueue || []) {
      const index = messageIndexAt(rendered.starts, rendered.lines, item.sourceSpan?.startOffset ?? -1);
      if (index >= 0 && !queueAt.has(index)) queueAt.set(index, []);
      if (index >= 0) queueAt.get(index).push(item);
    }

    chat.messages.forEach((message, index) => {
      messages += 1;
      const isTask = message.label === "task";
      const isVague = message.label === "vague";
      const goldPositive = isTask || isVague;
      if (goldPositive) goldPositives += 1;
      const inConfirmed = actionAt.has(index);
      const inQueue = queueAt.has(index);
      const detected = inConfirmed || inQueue;
      const where = `${chat.id}#${index + 1}`;
      const sliceKeys = [`lang:${chat.lang}`, ...(message.kind ? [`kind:${message.kind}`] : [])];

      // confirmed-only view: `vague` is neutral (neither required nor penalised)
      if (isTask) {
        if (inConfirmed) { confirmed.tp += 1; sliceKeys.forEach((k) => { sliceOf(k).confirmed.tp += 1; }); }
        else { confirmed.fn += 1; sliceKeys.forEach((k) => { sliceOf(k).confirmed.fn += 1; }); misses.push({ where, text: message.text, inQueue }); }
      } else if (!isVague && inConfirmed) {
        confirmed.fp += 1; sliceKeys.forEach((k) => { sliceOf(k).confirmed.fp += 1; });
        falseAlarms.push({ where, text: message.text });
      }

      // combined view: confirmed + review queue
      if (goldPositive) {
        if (detected) { combined.tp += 1; sliceKeys.forEach((k) => { sliceOf(k).combined.tp += 1; }); }
        else { combined.fn += 1; sliceKeys.forEach((k) => { sliceOf(k).combined.fn += 1; }); }
      } else if (detected) {
        combined.fp += 1; sliceKeys.forEach((k) => { sliceOf(k).combined.fp += 1; });
        if (!inConfirmed) queueNoise.push({ where, text: message.text });
      }

      if (inQueue) {
        queue.items += 1;
        if (goldPositive) queue.real += 1;
      }

      if (isTask && inConfirmed) {
        const found = actionAt.get(index);
        if (message.owner !== undefined) {
          owner.total += 1;
          const extracted = found.map((a) => a.owner).filter(Boolean);
          const ok = message.owner === null ? extracted.length === 0 : extracted.some((o) => nameKey(o) === nameKey(message.owner));
          if (ok) owner.correct += 1;
        }
        if (message.due !== undefined) {
          deadline.total += 1;
          if (found.some((a) => a.resolvedDueDate === message.due)) deadline.correct += 1;
        }
      }
    });
  }

  const mapSlices = Object.fromEntries(Object.entries(slices).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, { confirmed: summarize(v.confirmed), combined: summarize(v.combined) }]));
  return {
    messages,
    goldPositives,
    confirmed: summarize(confirmed),
    combined: summarize(combined),
    ownerAccuracy: { ...owner, rate: ratio(owner.correct, owner.total) },
    deadlineAccuracy: { ...deadline, rate: ratio(deadline.correct, deadline.total) },
    queue: { ...queue, yield: ratio(queue.real, queue.items) },
    slices: mapSlices,
    misses,
    falseAlarms,
    queueNoise,
  };
}

const pct = (v) => (v === null ? "  n/a" : `${(v * 100).toFixed(0).padStart(3)}%`);

export function formatReport(r, { showMisses = false } = {}) {
  const row = (name, s) => `| ${name.padEnd(30)} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} | ${String(s.tp).padStart(3)} | ${String(s.fp).padStart(3)} | ${String(s.fn).padStart(3)} |`;
  const lines = [];
  lines.push(`Messages: ${r.messages} · gold commitments: ${r.goldPositives}`);
  lines.push("");
  lines.push("| View                           | Prec | Rec  | F1   |  TP |  FP |  FN |");
  lines.push("|--------------------------------|------|------|------|-----|-----|-----|");
  lines.push(row("Confirmed tasks only", r.confirmed));
  lines.push(row("Confirmed + review queue", r.combined));
  lines.push("");
  lines.push(`Owner accuracy (confirmed, scored ${r.ownerAccuracy.total}):    ${pct(r.ownerAccuracy.rate)}`);
  lines.push(`Deadline accuracy (confirmed, scored ${r.deadlineAccuracy.total}): ${pct(r.deadlineAccuracy.rate)}`);
  lines.push(`Review-queue yield: ${r.queue.real}/${r.queue.items} queue items were real commitments (${pct(r.queue.yield).trim()})`);
  lines.push("");
  lines.push("| Slice                          | Prec | Rec  | F1   |  TP |  FP |  FN |");
  lines.push("|--------------------------------|------|------|------|-----|-----|-----|");
  for (const [key, v] of Object.entries(r.slices)) {
    lines.push(row(`${key} (confirmed)`, v.confirmed));
    lines.push(row(`${key} (+queue)`, v.combined));
  }
  if (showMisses) {
    lines.push("", "Missed as confirmed task:");
    r.misses.forEach((m) => lines.push(`  - ${m.where}${m.inQueue ? " (in queue)" : ""}: ${m.text}`));
    lines.push("", "False alarms (confirmed):");
    r.falseAlarms.forEach((m) => lines.push(`  - ${m.where}: ${m.text}`));
    lines.push("", "Queue noise (queued, not a commitment):");
    r.queueNoise.forEach((m) => lines.push(`  - ${m.where}: ${m.text}`));
  }
  return lines.join("\n");
}
