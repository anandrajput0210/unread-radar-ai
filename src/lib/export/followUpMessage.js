import { hasGroundedOwner, ownerMatch } from "../views/catchUpBrief.js";

const HEADER = "Quick recap from the thread (from the chat text, please correct me):";
const CLOSED_LIFECYCLE = new Set(["completed", "cancelled"]);
const CLOSED_MANUAL = new Set(["completed", "cancelled", "rejected"]);

function normalizedName(name) {
  return String(name ?? "")
    .normalize("NFC")
    .replace(/^@/u, "")
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter(Boolean)
    .join(" ");
}

function distinctSpeakers(speakers) {
  const seen = new Set();
  return (Array.isArray(speakers) ? speakers : []).filter((speaker) => {
    if (typeof speaker !== "string" || !speaker.trim()) return false;
    const key = normalizedName(speaker);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isClosed(task, statuses) {
  return CLOSED_LIFECYCLE.has(task.lifecycleStatus)
    || CLOSED_MANUAL.has(statuses?.[task.id]);
}

function safeText(value) {
  return String(value ?? "").trim().replace(/@/gu, "");
}

function comparableText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function uniqueOwner(owner, speakers) {
  const matches = speakers.filter((speaker) => ownerMatch(owner, speaker, speakers) === "yes");
  return matches.length === 1 ? matches[0] : null;
}

function deadlinePhrase(task) {
  const phrase = typeof task.dueDate === "string" && task.dueDate.trim()
    ? task.dueDate
    : task.originalDueDate;
  return typeof phrase === "string" ? safeText(phrase) : "";
}

export function buildFollowUpMessage(actions, { statuses = {}, speakers = [] } = {}) {
  const tasks = Array.isArray(actions) ? actions.filter((task) => task && typeof task === "object") : [];
  const speakerList = distinctSpeakers(speakers);
  const confirmed = [];
  const unclear = [];

  for (const task of tasks) {
    if (isClosed(task, statuses)) continue;

    const text = safeText(task.text);
    if (!text) continue;

    const owner = task.outcome === "confirmed"
      && task.ownerBasis !== "ambiguous"
      && task.classification !== "collective_task"
      && task.collective !== true
      && hasGroundedOwner(task)
      ? uniqueOwner(task.owner, speakerList)
      : null;

    if (owner) {
      const ownerName = safeText(task.owner);
      const phrase = deadlinePhrase(task);
      const deadline = phrase && !comparableText(text).includes(comparableText(phrase))
        ? ` (deadline: ${phrase})`
        : "";
      confirmed.push(`- ${ownerName}: ${text}${deadline}`);
    } else {
      unclear.push(`- ${text}`);
    }
  }

  const lines = [HEADER];
  if (confirmed.length) {
    lines.push("", "Confirmed in this chat:", ...confirmed);
  } else if (!unclear.length) {
    lines.push("No confirmed owners were found in this chat.");
  }
  if (unclear.length) {
    lines.push("", "Still unclear - who is taking these?", ...unclear);
  }

  return {
    text: lines.join("\n"),
    includedCount: confirmed.length + unclear.length,
    openQuestionCount: unclear.length,
  };
}
