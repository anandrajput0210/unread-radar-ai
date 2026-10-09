import React, { useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  Clock3,
  Command,
  Copy,
  Download,
  FileText,
  Upload,
  Filter,
  Hash,
  LockKeyhole,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";

const MOCK_TEMPLATES = [
  {
    id: "project",
    label: "Chaotic Project Slack Thread",
    description: "Deadlines, decisions, and owners",
    icon: MessageSquareText,
    text: `#launch-project
Maya: We need to ship the onboarding flow by Friday.
@alex can you finish the empty states by 5pm today? This is blocking QA.
Jordan: Agreed on keeping the new navigation for v1. We'll revisit analytics after launch.
Maya: Action: @sam to review the copy tomorrow morning.
Alex: I'm blocked by the missing API response. Need to get a decision from backend ASAP.
Sam: todo — send final copy to Maya by EOD.
Jordan: The launch checklist is approved. Please flag anything critical in this thread.`,
  },
  {
    id: "outage",
    label: "Urgent Outage Room Chat",
    description: "Incident signals and next steps",
    icon: Activity,
    text: `INCIDENT ROOM — Checkout latency
Priya: Critical: checkout errors are spiking. We need to investigate immediately.
@dev-oncall: please roll back the last deploy ASAP and post status by 5pm.
Leo: Database CPU is high; I am checking the slow queries now.
Priya: Action item: @leo to share query findings in 15 minutes.
Nina: Agreed on pausing the campaign until error rates recover.
@support: notify affected customers by 6pm today.
Leo: I'm blocked waiting for read-replica metrics. Need to escalate to infra.
Priya: Next update tomorrow at 9am if the incident is still open.`,
  },
  {
    id: "family",
    label: "Missed Family Catchup",
    description: "Plans, reminders, and mentions",
    icon: Users,
    text: `Mom: Family lunch is on Sunday at 1pm. Please let us know if you can come.
@you can bring dessert if that's easy 🙂
Ravi: We agreed on meeting at Grandma's place.
Auntie: Need to confirm the headcount by Friday.
Dad: todo — book the train tickets tomorrow morning.
Mom: Please call Grandma ASAP; she wants to discuss the plan.
Ravi: I can pick up the groceries by 5pm on Saturday.
Auntie: Don't forget the photo album. Thanks everyone!`,
  },
];


const HIGH_URGENCY_TERMS = [
  "asap",
  "urgent",
  "critical",
  "blocked",
  "immediately",
  "outage",
  "emergency",
  "spiking",
  "incident",
  "overdue",
];

const MEDIUM_URGENCY_TERMS = [
  "deadline",
  "due",
  "today",
  "tonight",
  "tomorrow",
  "yesterday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "eod",
  "eow",
  "eoy",
  "need to",
  "follow up",
];

const MEDIUM_URGENCY_PATTERNS = [
  /\b(?:by|before|at|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i,
  /\b(?:by|before)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|eoy|next\s+week|next\s+month)\b/i,
];

const TASK_VERBS = [
  "follow up",
  "pick up",
  "roll back",
  "send out",
  "reschedule",
  "investigate",
  "complete",
  "prepare",
  "escalate",
  "respond",
  "restart",
  "restore",
  "schedule",
  "confirm",
  "publish",
  "replace",
  "forward",
  "monitor",
  "approve",
  "review",
  "submit",
  "create",
  "remove",
  "assign",
  "verify",
  "install",
  "document",
  "cancel",
  "pause",
  "deploy",
  "update",
  "finish",
  "notify",
  "provide",
  "attach",
  "merge",
  "build",
  "check",
  "write",
  "share",
  "close",
  "open",
  "bring",
  "tell",
  "call",
  "test",
  "fix",
  "book",
  "send",
  "ship",
  "flag",
  "run",
  "get",
  "set",
  "add",
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TASK_VERB_SOURCE = [...TASK_VERBS]
  .sort((a, b) => b.length - a.length)
  .map((verb) =>
    escapeRegex(verb).replace(/\s+/g, "\\s+")
  )
  .join("|");

const HANDLE_SOURCE = String.raw`[\p{L}\p{N}_-](?:[\p{L}\p{N}._-]{0,38}[\p{L}\p{N}_-])?`;

const MENTION_REGEX = new RegExp(
  String.raw`(^|[\s([{"'])@(${HANDLE_SOURCE})`,
  "gu"
);

const SPECIAL_MENTIONS = new Set([
  "here",
  "channel",
  "everyone",
]);

const DATE_REGEX =
  /\b(?:today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|eoy|next week|next month|(?:by|before|at|around)\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2})\b/gi;

const ACTION_LABEL_REGEX =
  /(?:^|:\s*)\b(?:action(?:\s+item)?|todo|to-do)\b\s*(?::|—|-|\s)/i;

const REQUEST_REGEX = new RegExp(
  String.raw`\b(?:please|can you|could you)\s+(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

const MODAL_DIRECTIVE_REGEX = new RegExp(
  String.raw`\b(?:need(?:s)? to|must|should|have to|has to)\s+(?!not\b)(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

const COMMITMENT_REGEX = new RegExp(
  String.raw`\b(?:I|we)\s+(?:can|will|shall|are going to|am going to)\s+(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

const IMPERATIVE_START_REGEX = new RegExp(
  String.raw`(?:^|[:.!?]\s+)(?:please\s+)?(?:${TASK_VERB_SOURCE})\b`,
  "i"
);

const DECISION_TERMS = [
  "agreed on",
  "decided",
  "approved",
  "decision:",
];

function normalizeLine(line) {
  return String(line ?? "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .trim();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();

  return items.filter((item) => {
    const key = keyFn(item);

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function isNegatedAt(text, index) {
  const prefix = text.slice(
    Math.max(0, index - 64),
    index
  );

  return /\b(?:no|not|never|without|isn't|isn’t|aren't|aren’t|wasn't|wasn’t|weren't|weren’t|don't|don’t|doesn't|doesn’t|didn't|didn’t|can't|can’t|cannot|won't|won’t|do not|does not|did not|can not|will not|is not|are not|was not|were not)\b(?:\W+\w+){0,3}\W*$/i.test(prefix);
}

function hasUnnegatedTerm(text, term) {
  const source = term
    .split(/\s+/)
    .map(escapeRegex)
    .join("\\s+");

  const regex = new RegExp(`\\b${source}\\b`, "gi");

  let match;

  while ((match = regex.exec(text)) !== null) {
    if (!isNegatedAt(text, match.index)) {
      return true;
    }

    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  return false;
}

function hasUnnegatedPattern(text, pattern) {
  const flags =
    `${pattern.ignoreCase ? "i" : ""}g` +
    `${pattern.unicode ? "u" : ""}`;

  const regex = new RegExp(pattern.source, flags);

  let match;

  while ((match = regex.exec(text)) !== null) {
    if (!isNegatedAt(text, match.index)) {
      return true;
    }

    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  return false;
}

function urgencyFor(text) {
  const value = String(text ?? "");

  if (
    HIGH_URGENCY_TERMS.some((term) =>
      hasUnnegatedTerm(value, term)
    )
  ) {
    return "High";
  }

  if (
    MEDIUM_URGENCY_TERMS.some((term) =>
      hasUnnegatedTerm(value, term)
    ) ||
    MEDIUM_URGENCY_PATTERNS.some((pattern) =>
      hasUnnegatedPattern(value, pattern)
    )
  ) {
    return "Medium";
  }

  return "Low";
}

function extractMentions(text) {
  const matches = [];

  for (const line of String(text ?? "").split(/\r?\n/)) {
    const regex = new RegExp(
      MENTION_REGEX.source,
      "gu"
    );

    let match;

    while ((match = regex.exec(line)) !== null) {
      const handle = match[2];

      if (
        handle &&
        !SPECIAL_MENTIONS.has(handle.toLowerCase())
      ) {
        matches.push({
          handle,
          line: normalizeLine(line),
        });
      }

      if (match[0].length === 0) {
        regex.lastIndex += 1;
      }
    }
  }

  return uniqueBy(
    matches,
    (item) =>
      `${item.handle.toLowerCase()}|${item.line.toLowerCase()}`
  );
}

function extractDeadlines(text) {
  const items = [];

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = normalizeLine(rawLine);

    if (!line) continue;

    const matches = [
      ...line.matchAll(
        new RegExp(DATE_REGEX.source, "gi")
      ),
    ].map((match) => match[0]);

    if (matches.length) {
      items.push({
        id: `deadline-${items.length}-${line.slice(0, 18)}`,
        text: line,
        dates: uniqueBy(
          matches.map((value) => value.trim()),
          (value) => value.toLowerCase()
        ),
        urgency: urgencyFor(line),
      });
    }
  }

  return uniqueBy(
    items,
    (item) => item.text.toLowerCase()
  );
}

function inferAssignee(line) {
  const explicit = line.match(
    new RegExp(
      String.raw`\b(?:assigned\s+to|assign(?:ed)?\s+to|owner|assignee|task\s+for)\s*[:=]?\s*(@${HANDLE_SOURCE})`,
      "iu"
    )
  );

  if (explicit) {
    return explicit[1];
  }

  // Infer an assignee only when a handle is explicitly addressed
  // with an action request. A stray mention is not task ownership.
  const directRequest = line.match(
    new RegExp(
      String.raw`(?:^|[\s([{"'])@(${HANDLE_SOURCE})(?:\s*:\s*(?=(?:please|can you|could you)\s+)|\s+)(?:(?:please|can you|could you|to)\s+)(?:${TASK_VERB_SOURCE})\b`,
      "iu"
    )
  );

  return directRequest
    ? `@${directRequest[1]}`
    : "Unassigned";
}

function hasActionDirective(line) {
  const labelMatch = ACTION_LABEL_REGEX.exec(line);

  if (labelMatch) {
    const afterLabel = line.slice(
      labelMatch.index + labelMatch[0].length
    );

    // An explicit action label followed by a negation is not a task.
    if (
      /^\s*(?:not\b|no\b|never\b|don't\b|don’t\b|do not\b|does not\b|is not\b|isn't\b|isn’t\b|not required\b)/i.test(afterLabel)
    ) {
      return false;
    }

    return true;
  }

  const lower = line.toLowerCase();

  const patterns = [
    REQUEST_REGEX,
    MODAL_DIRECTIVE_REGEX,
    COMMITMENT_REGEX,
    IMPERATIVE_START_REGEX,
  ];

  return patterns.some((pattern) => {
    const regex = new RegExp(
      pattern.source,
      pattern.flags.replace("g", "")
    );

    const match = regex.exec(lower);

    return Boolean(
      match && !isNegatedAt(lower, match.index)
    );
  });
}

function hasDecisionSignal(line) {
  return DECISION_TERMS.some((term) =>
    hasUnnegatedTerm(line, term)
  );
}

function extractActions(text) {
  const actions = [];
  const decisions = [];

  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  lines.forEach((line, index) => {
    const hasAction = hasActionDirective(line);
    const hasDecision = hasDecisionSignal(line);

    if (hasAction) {
      actions.push({
        id: `task-${index}-${line.slice(0, 16)}`,
        text: line,
        owner: inferAssignee(line),
        urgency: urgencyFor(line),
        completed: false,
      });
    }

    if (hasDecision) {
      decisions.push(line);
    }
  });

  return {
    actions: uniqueBy(
      actions,
      (item) => item.text.toLowerCase()
    ),
    decisions: uniqueBy(
      decisions,
      (item) => item.toLowerCase()
    ),
  };
}

function buildSummary(
  text,
  actions,
  deadlines,
  decisions,
  mentions
) {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  if (!lines.length) return [];

  const summary = [];

  if (actions.length) {
    const highCount = actions.filter(
      (item) => item.urgency === "High"
    ).length;

    summary.push(
      `${actions.length} potential action item${actions.length === 1 ? "" : "s"} detected; ${highCount} marked high priority.`
    );
  }

  if (decisions.length) {
    summary.push(
      `${decisions.length} possible decision${decisions.length === 1 ? "" : "s"} found, including: “${decisions[0]}”.`
    );
  }

  if (deadlines.length) {
    const examples = uniqueBy(
      deadlines.flatMap((item) => item.dates),
      (value) => value.toLowerCase()
    ).slice(0, 4);

    summary.push(
      `Time references detected: ${examples.join(", ")}.`
    );
  }

  if (mentions.length) {
    const handles = uniqueBy(
      mentions.map((item) => `@${item.handle}`),
      (value) => value.toLowerCase()
    ).slice(0, 5);

    summary.push(
      `Direct mentions to review: ${handles.join(", ")}.`
    );
  }

  lines
    .filter((line) => urgencyFor(line) === "High")
    .slice(0, 2)
    .forEach((line) =>
      summary.push(`High-signal message: “${line}”.`)
    );

  if (!summary.length) {
    summary.push(
      "No clear action items, decisions, deadlines, or direct mentions were detected."
    );

    summary.push(
      "Review the original conversation before treating this as a complete summary."
    );
  }

  return summary;
}

function analyzeConversations(rawText) {
  const text =
    typeof rawText === "string" ? rawText.trim() : "";

  if (!text) {
    return {
      actions: [],
      decisions: [],
      deadlines: [],
      mentions: [],
      summary: [],
      alerts: [],
      urgentRows: [],
      lineCount: 0,
    };
  }

  const sourceLines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const urgentRows = sourceLines.filter(
    (line) => urgencyFor(line) === "High"
  );

  const mentions = extractMentions(text);
  const deadlines = extractDeadlines(text);
  const { actions, decisions } = extractActions(text);

  const alerts = uniqueBy(
    [
      ...actions.map((item) => ({
        ...item,
        kind: "Action item",
      })),

      ...deadlines.map((item) => ({
        ...item,
        kind: "Deadline",
      })),

      ...mentions.map((item, index) => ({
        id: `mention-${index}`,
        text: `@${item.handle} mentioned: ${item.line}`,
        owner: item.handle,
        urgency: urgencyFor(item.line),
        kind: "Mention",
      })),
    ],
    (item) =>
      `${item.kind}|${item.text.toLowerCase()}`
  );

  return {
    actions,
    decisions,
    deadlines,
    mentions,
    summary: buildSummary(
      text,
      actions,
      deadlines,
      decisions,
      mentions
    ),
    alerts,
    urgentRows,
    lineCount: sourceLines.length,
  };
}


function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Badge({ children, tone = "slate", className = "" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", tones[tone] || tones.slate, className)}>
      {children}
    </span>
  );
}

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">{eyebrow}</p>}
        <h2 className="text-lg font-bold tracking-tight text-slate-950">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, caption, tone = "blue" }) {
  const styles = {
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950 tabular-nums">{value}</p>
        </div>
        <div className={cx("rounded-xl p-2.5 ring-1", styles[tone])}>
          <Icon size={19} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{caption}</p>
    </div>
  );
}

function EmptyState({ icon: Icon = FileText, title, description }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-8 text-center">
      <div className="mb-3 rounded-xl bg-white p-3 text-slate-400 shadow-sm ring-1 ring-slate-200">
        <Icon size={22} aria-hidden="true" />
      </div>
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export default function App() {
  const [chatText, setChatText] = useState("");
  const [activeTemplate, setActiveTemplate] = useState("");
  const [activeTab, setActiveTab] = useState("summary");
  const [taskStates, setTaskStates] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("All");
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState("");
  const [fileStatus, setFileStatus] = useState({ type: "", message: "" });
  const [exportStatus, setExportStatus] = useState({ type: "", message: "" });
  const fileInputRef = useRef(null);

  const analysis = useMemo(() => analyzeConversations(chatText), [chatText]);
  const completedCount = analysis.actions.filter((task) => taskStates[task.id]).length;
  const openTasks = analysis.actions.filter((task) => !taskStates[task.id]);
  const highAlerts = analysis.alerts.filter((item) => item.urgency === "High").length;
  const missedMentions = analysis.mentions.length;
  const safeLineCount = analysis.lineCount;
  const toPercent = (value, total) => total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const analyticsMeters = [
    {
      id: "urgent-lines",
      label: "Urgent lines",
      count: analysis.urgentRows.length,
      percent: toPercent(analysis.urgentRows.length, safeLineCount),
      description: "Rows classified as high urgency",
      fillClass: "bg-rose-500",
      icon: AlertCircle,
      toneClass: "text-rose-700 bg-rose-50",
    },
    {
      id: "action-items",
      label: "Action items",
      count: analysis.actions.length,
      percent: toPercent(analysis.actions.length, safeLineCount),
      description: "Distinct task-like rows extracted",
      fillClass: "bg-indigo-500",
      icon: ClipboardList,
      toneClass: "text-indigo-700 bg-indigo-50",
    },
    {
      id: "deadline-rows",
      label: "Deadline signals",
      count: analysis.deadlines.length,
      percent: toPercent(analysis.deadlines.length, safeLineCount),
      description: "Rows containing recognized time phrases",
      fillClass: "bg-amber-500",
      icon: CalendarClock,
      toneClass: "text-amber-700 bg-amber-50",
    },
  ];

  const filteredActions = analysis.actions.filter((task) => {
    const matchesSearch = task.text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUrgency = urgencyFilter === "All" || task.urgency === urgencyFilter;
    return matchesSearch && matchesUrgency;
  });

  function selectTemplate(template) {
    setChatText(template.text);
    setActiveTemplate(template.id);
    setLoadedFileName("");
    setFileStatus({ type: "", message: "" });
    setExportStatus({ type: "", message: "" });
    setTaskStates({});
    setActiveTab("summary");
    setSearchQuery("");
    setUrgencyFilter("All");
  }

  function toggleTask(id) {
    setTaskStates((current) => ({ ...current, [id]: !current[id] }));
  }

  function resetAnalysisView() {
    setTaskStates({});
    setActiveTab("summary");
    setSearchQuery("");
    setUrgencyFilter("All");
    setExportStatus({ type: "", message: "" });
  }

  function handleLocalFile(file) {
    setFileStatus({ type: "", message: "" });
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const supportedType = lowerName.endsWith(".txt") || lowerName.endsWith(".log");
    const maxBytes = 5 * 1024 * 1024;

    if (!supportedType) {
      setFileStatus({ type: "error", message: "Unsupported file type. Choose a .txt or .log file." });
      return;
    }
    if (file.size > maxBytes) {
      setFileStatus({ type: "error", message: "This file is larger than 5 MB. Choose a smaller text log." });
      return;
    }
    if (typeof FileReader === "undefined") {
      setFileStatus({ type: "error", message: "File reading is not supported in this browser." });
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          setFileStatus({ type: "error", message: "The file could not be decoded as text." });
          return;
        }
        setChatText(reader.result);
        setActiveTemplate("");
        setLoadedFileName(file.name);
        setFileStatus({ type: "success", message: `Loaded ${file.name} locally. The dashboard has been refreshed.` });
        resetAnalysisView();
      };
      reader.onerror = () => {
        setFileStatus({ type: "error", message: "The selected file could not be read. Try another .txt or .log file." });
      };
      reader.onabort = () => {
        setFileStatus({ type: "error", message: "File reading was cancelled." });
      };
      reader.readAsText(file, "UTF-8");
    } catch {
      setFileStatus({ type: "error", message: "Unable to open this file. Please try another text log." });
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      setFileStatus({ type: "error", message: "No file was detected. Drop a .txt or .log file here." });
      return;
    }
    handleLocalFile(file);
  }

  function downloadExecutiveBrief() {
    setExportStatus({ type: "", message: "" });
    if (!chatText.trim()) {
      setExportStatus({ type: "error", message: "Add a chat log before exporting the executive brief." });
      return;
    }

    const generatedAt = new Date().toLocaleString();
    const taskLines = analysis.actions.length
      ? analysis.actions.map((task) => `- [${taskStates[task.id] ? "x" : " "}] **${task.urgency}** — ${task.text} _(Owner signal: ${task.owner || "Unassigned"})_`)
      : ["- No action items were detected."];
    const urgentLines = analysis.urgentRows.length
      ? analysis.urgentRows.map((line) => `> ${line.replace(/\r/g, "").replace(/\n/g, " ")}`)
      : ["> No high-urgency rows were detected."];
    const mentionLines = analysis.mentions.length
      ? analysis.mentions.map((mention) => `- **@${mention.handle}** — ${mention.line}`)
      : ["- No direct mentions were detected."];
    const deadlineLines = analysis.deadlines.length
      ? analysis.deadlines.map((deadline) => `- **${deadline.dates.join(", ")}** — ${deadline.text}`)
      : ["- No recognized deadline phrases were detected."];
    const decisionLines = analysis.decisions.length
      ? analysis.decisions.map((decision) => `- ${decision}`)
      : ["- No likely decisions were detected."];

    const markdown = [
      "# Unread Radar AI — Local Executive Brief",
      "",
      `- **Generated:** ${generatedAt}`,
      `- **Source:** ${loadedFileName ? loadedFileName : "Pasted conversation"}`,
      "- **Processing:** Client-side rule extraction; no AI API used",
      "",
      "## Executive Summary",
      "",
      ...(analysis.summary.length ? analysis.summary.map((item) => `- ${item}`) : ["- No summary signals were detected."]),
      "",
      "## Operational Index Analytics",
      "",
      `- **Non-empty rows:** ${analysis.lineCount}`,
      `- **Total alerts:** ${analysis.alerts.length}`,
      `- **High-urgency rows:** ${analysis.urgentRows.length} (${toPercent(analysis.urgentRows.length, safeLineCount)}%)`,
      `- **Action items:** ${analysis.actions.length} (${toPercent(analysis.actions.length, safeLineCount)}% of rows)`,
      `- **Missed mentions:** ${analysis.mentions.length}`,
      "",
      "## Action Items",
      "",
      ...taskLines,
      "",
      "## High-Urgency Rows",
      "",
      ...urgentLines,
      "",
      "## Mentions",
      "",
      ...mentionLines,
      "",
      "## Deadlines and Scheduling Signals",
      "",
      ...deadlineLines,
      "",
      "## Possible Decisions",
      "",
      ...decisionLines,
      "",
      "---",
      "Generated locally by Unread Radar AI. Keyword-based extraction can miss context; verify important items against the original conversation.",
      "",
    ].join("\n");

    let objectUrl = "";
    let downloadAnchor = null;
    try {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      objectUrl = URL.createObjectURL(blob);
      downloadAnchor = document.createElement("a");
      downloadAnchor.href = objectUrl;
      downloadAnchor.download = "unread-radar-brief.md";
      downloadAnchor.style.display = "none";
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      setExportStatus({ type: "success", message: "Executive brief generated locally as unread-radar-brief.md." });
    } catch {
      setExportStatus({ type: "error", message: "The brief could not be downloaded in this browser." });
    } finally {
      if (downloadAnchor?.parentNode) downloadAnchor.parentNode.removeChild(downloadAnchor);
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }

  async function copySummary() {
    const content = [
      "WHAT DID I MISS? — LOCAL SUMMARY",
      "",
      ...analysis.summary.map((item) => `• ${item}`),
      "",
      "ACTION ITEMS",
      ...analysis.actions.map((item) => `• [${taskStates[item.id] ? "x" : " "}] [${item.urgency}] ${item.text}`),
      "",
      "DECISIONS",
      ...analysis.decisions.map((item) => `• ${item}`),
    ].join("\n");

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
      } else {
        const element = document.createElement("textarea");
        element.value = content;
        element.setAttribute("readonly", "");
        element.style.position = "fixed";
        element.style.opacity = "0";
        document.body.appendChild(element);
        element.select();
        const success = document.execCommand("copy");
        document.body.removeChild(element);
        if (!success) throw new Error("Clipboard copy was blocked");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      window.alert("Could not access the clipboard. Please select and copy the summary manually.");
    }
  }

  const tabs = [
    { id: "summary", label: "Summary", icon: Sparkles, count: analysis.summary.length },
    { id: "tasks", label: "Action items", icon: ClipboardList, count: analysis.actions.length },
    { id: "matrix", label: "Urgency matrix", icon: Target, count: analysis.alerts.length },
  ];

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-72 bg-gradient-to-b from-indigo-50/90 via-blue-50/40 to-transparent" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-indigo-950/15">
              <Command size={22} strokeWidth={2.2} aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-extrabold tracking-tight text-slate-950">missed.</p>
                <Badge tone="violet">ProtocolX</Badge>
              </div>
              <p className="text-xs font-medium text-slate-500">The unread problem, made manageable.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green" className="px-3 py-1.5">
              <ShieldCheck size={14} aria-hidden="true" />
              100% Local Privacy Secure
            </Badge>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              No server connection
            </span>
          </div>
        </header>

        <main className="relative z-10">
          <section className="grid gap-8 py-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm">
                <Sparkles size={14} aria-hidden="true" />
                Your conversation intelligence workspace
              </div>
              <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-4xl lg:text-[2.7rem]">
                Catch up on what
                <span className="block text-indigo-600">actually matters.</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                Turn noisy chat logs into a clear picture of decisions, deadlines, direct mentions, and next steps — processed right here in your browser.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-200"><LockKeyhole size={14} /> Private by design</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-200"><Activity size={14} /> Instant rule-based scan</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-200"><CheckCheck size={14} /> Action tracking</span>
              </div>
            </div>

            <div className="rounded-2xl border border-indigo-100 bg-white/90 p-4 shadow-xl shadow-indigo-950/[0.04] sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-950">Quick mock templates</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Load a sample conversation to explore the dashboard.</p>
                </div>
                <span className="hidden rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:inline">Try a sample</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {MOCK_TEMPLATES.map((template) => {
                  const Icon = template.icon;
                  const selected = activeTemplate === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => selectTemplate(template)}
                      aria-pressed={selected}
                      className={cx(
                        "group rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
                        selected ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200" : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                      )}
                    >
                      <span className={cx("mb-3 flex h-9 w-9 items-center justify-center rounded-lg", selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700")}>
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <span className="block text-xs font-bold leading-5 text-slate-800">{template.label}</span>
                      <span className="mt-1 block text-[11px] leading-4 text-slate-500">{template.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><MessageSquareText size={17} aria-hidden="true" /></div>
                    <h2 className="font-bold text-slate-950">Conversation input</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">Paste raw messages below. Results update as you type.</p>
                </div>
                <Badge tone="green"><LockKeyhole size={12} /> Local</Badge>
              </div>
              <div
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false);
                }}
                onDrop={handleDrop}
                className={cx(
                  "mb-4 rounded-xl border-2 border-dashed p-4 transition-colors",
                  isDragging ? "border-indigo-500 bg-indigo-50 ring-4 ring-indigo-100" : "border-slate-300 bg-slate-50/80 hover:border-indigo-300 hover:bg-indigo-50/40"
                )}
                role="region"
                aria-label="Local chat log file upload"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.log,text/plain"
                  className="sr-only"
                  aria-label="Choose a local .txt or .log chat file"
                  onChange={(event) => {
                    handleLocalFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <div className="flex flex-col items-center justify-center gap-2 text-center sm:flex-row sm:text-left">
                  <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", isDragging ? "bg-indigo-600 text-white" : "bg-white text-indigo-600 ring-1 ring-slate-200")}>
                    <Upload size={21} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">Drop a .txt or .log file here</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Read locally in your browser · Maximum file size 5 MB</p>
                    {loadedFileName && <p className="mt-1 truncate text-xs font-semibold text-emerald-700">Current file: {loadedFileName}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  >
                    <FileText size={14} aria-hidden="true" /> Browse files
                  </button>
                </div>
                {fileStatus.message && (
                  <p
                    className={cx("mt-3 rounded-lg px-3 py-2 text-xs leading-5", fileStatus.type === "error" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800")}
                    role={fileStatus.type === "error" ? "alert" : "status"}
                    aria-live="polite"
                  >
                    {fileStatus.message}
                  </p>
                )}
              </div>
              <label htmlFor="chat-log" className="mb-2 block text-sm font-semibold text-slate-700">Chat log</label>
              <textarea
                id="chat-log"
                value={chatText}
                onChange={(event) => {
                  setChatText(event.target.value);
                  setActiveTemplate("");
                  setLoadedFileName("");
                  setFileStatus({ type: "", message: "" });
                  setExportStatus({ type: "", message: "" });
                }}
                placeholder={"Paste Slack, Teams, WhatsApp, or any plain-text conversation…\n\nExample:\nMaya: @alex please send the draft by Friday.\nAlex: Action: I'll finish it by 5pm."}
                rows={15}
                spellCheck="false"
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 font-mono text-xs leading-6 text-slate-800 placeholder:font-sans placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>{chatText.length.toLocaleString()} characters · {analysis.lineCount} non-empty lines</span>
                <button
                  type="button"
                  onClick={() => {
                    setChatText("");
                    setActiveTemplate("");
                    setLoadedFileName("");
                    setFileStatus({ type: "", message: "" });
                    setExportStatus({ type: "", message: "" });
                    setTaskStates({});
                  }}
                  disabled={!chatText}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <X size={13} /> Clear input
                </button>
              </div>
              <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3.5">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-bold text-emerald-900">Your text stays on this device</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-800/80">This demo uses deterministic client-side rules. It does not call an AI API or transmit chat text to a server.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MetricCard icon={Bell} label="Total alerts" value={analysis.alerts.length} caption={`${highAlerts} high-priority signals`} tone="rose" />
                <MetricCard icon={ClipboardList} label="Extracted tasks" value={analysis.actions.length} caption={`${completedCount} completed · ${openTasks.length} open`} tone="blue" />
                <MetricCard icon={Hash} label="Missed mentions" value={missedMentions} caption="Direct @mentions found" tone="violet" />
              </div>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5" aria-labelledby="operational-index-heading">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Live metrics</p>
                    <h2 id="operational-index-heading" className="text-lg font-bold tracking-tight text-slate-950">Operational Index Analytics</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Row-based ratios recalculated from the current input.</p>
                  </div>
                  <button
                    type="button"
                    onClick={downloadExecutiveBrief}
                    disabled={!chatText.trim()}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    <Download size={15} aria-hidden="true" />
                    Download Local Executive Brief (.md)
                  </button>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {analyticsMeters.map((meter) => {
                    const Icon = meter.icon;
                    return (
                      <div key={meter.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meter.toneClass)}>
                              <Icon size={17} aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800">{meter.label}</p>
                              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{meter.description}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-extrabold tabular-nums text-slate-950">{meter.percent}%</p>
                            <p className="text-[10px] text-slate-500">{meter.count} / {safeLineCount} rows</p>
                          </div>
                        </div>
                        <div
                          className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200"
                          role="progressbar"
                          aria-label={`${meter.label} ratio`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={meter.percent}
                          aria-valuetext={`${meter.percent}% of ${safeLineCount} non-empty rows`}
                        >
                          <div
                            className={cx("h-full rounded-full transition-[width] duration-300 ease-out", meter.fillClass)}
                            style={{ width: `${meter.percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {exportStatus.message && (
                  <p
                    className={cx("mt-4 rounded-lg px-3 py-2 text-xs leading-5", exportStatus.type === "error" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800")}
                    role={exportStatus.type === "error" ? "alert" : "status"}
                    aria-live="polite"
                  >
                    {exportStatus.message}
                  </p>
                )}
              </section>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
                <div className="border-b border-slate-200 px-4 pt-4 sm:px-5">
                  <SectionHeading
                    eyebrow="Your catch-up brief"
                    title="Signal over noise"
                    description="Prioritized findings extracted from your pasted conversation."
                    action={
                      <button
                        type="button"
                        onClick={copySummary}
                        disabled={!chatText.trim()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? "Copied" : "Copy brief"}
                      </button>
                    }
                  />
                  <div className="mt-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Analysis views">
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      const selected = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          id={`tab-${tab.id}`}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          aria-controls={`panel-${tab.id}`}
                          onClick={() => setActiveTab(tab.id)}
                          className={cx(
                            "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 sm:px-4",
                            selected ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                          )}
                        >
                          <Icon size={15} aria-hidden="true" />
                          {tab.label}
                          <span className={cx("rounded-md px-1.5 py-0.5 text-[10px]", selected ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500")}>{tab.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  {activeTab === "summary" && (
                    <div id="panel-summary" role="tabpanel" aria-labelledby="tab-summary" className="space-y-4">
                      {!chatText.trim() ? (
                        <EmptyState icon={Sparkles} title="Your brief will appear here" description="Paste a conversation or select a quick mock template to extract the important signals." />
                      ) : (
                        <>
                          <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 p-4 ring-1 ring-indigo-100">
                            <div className="mb-3 flex items-center gap-2 text-indigo-800">
                              <Sparkles size={17} aria-hidden="true" />
                              <h3 className="text-sm font-bold">AI-style bulleted summary</h3>
                              <Badge tone="blue">Rule-extracted</Badge>
                            </div>
                            <ul className="space-y-3">
                              {analysis.summary.map((item, index) => (
                                <li key={`${index}-${item}`} className="flex gap-2.5 text-sm leading-6 text-slate-700">
                                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 p-3.5">
                              <div className="mb-2 flex items-center gap-2 text-slate-700"><CalendarClock size={16} className="text-indigo-600" /><p className="text-xs font-bold">Deadlines detected</p></div>
                              {analysis.deadlines.length ? (
                                <ul className="space-y-2">
                                  {analysis.deadlines.slice(0, 4).map((item) => (
                                    <li key={item.id} className="text-xs leading-5 text-slate-600">
                                      <Badge tone={item.urgency === "High" ? "red" : item.urgency === "Medium" ? "amber" : "slate"}>{item.dates.join(", ")}</Badge>
                                      <p className="mt-1.5">{item.text}</p>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="text-xs leading-5 text-slate-400">No explicit date phrases found.</p>}
                            </div>
                            <div className="rounded-xl border border-slate-200 p-3.5">
                              <div className="mb-2 flex items-center gap-2 text-slate-700"><Users size={16} className="text-violet-600" /><p className="text-xs font-bold">Direct mentions</p></div>
                              {analysis.mentions.length ? (
                                <ul className="space-y-2">
                                  {analysis.mentions.slice(0, 5).map((item, index) => (
                                    <li key={`${item.handle}-${index}`} className="text-xs leading-5 text-slate-600">
                                      <span className="font-bold text-violet-700">@{item.handle}</span>
                                      <p className="mt-0.5 line-clamp-2">{item.line}</p>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="text-xs leading-5 text-slate-400">No direct @mentions found.</p>}
                            </div>
                          </div>
                          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                            <AlertCircle size={15} className="mt-0.5 shrink-0" />
                            Rule-based extraction can miss context or misclassify messages. Verify important dates, owners, and decisions against the original chat.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {activeTab === "tasks" && (
                    <div id="panel-tasks" role="tabpanel" aria-labelledby="tab-tasks" className="space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="relative flex-1">
                          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                          <label htmlFor="task-search" className="sr-only">Search action items</label>
                          <input id="task-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search action items…" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-xs focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100" />
                        </div>
                        <div className="relative">
                          <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                          <label htmlFor="urgency-filter" className="sr-only">Filter by urgency</label>
                          <select id="urgency-filter" value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value)} className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100">
                            <option>All</option><option>High</option><option>Medium</option><option>Low</option>
                          </select>
                          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        </div>
                      </div>
                      {filteredActions.length ? (
                        <div className="space-y-2">
                          {filteredActions.map((task) => {
                            const done = Boolean(taskStates[task.id]);
                            return (
                              <label key={task.id} className={cx("flex cursor-pointer gap-3 rounded-xl border p-3.5 transition", done ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50/60")}>
                                <input type="checkbox" checked={done} onChange={() => toggleTask(task.id)} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                                <span className="min-w-0 flex-1">
                                  <span className={cx("block text-sm leading-6", done ? "text-slate-400 line-through" : "text-slate-800")}>{task.text}</span>
                                  <span className="mt-2 flex flex-wrap items-center gap-2">
                                    <Badge tone={task.urgency === "High" ? "red" : task.urgency === "Medium" ? "amber" : "slate"}>{task.urgency} priority</Badge>
                                    <span className="text-[11px] text-slate-400">Assignment evidence: {task.owner || "Unassigned"}</span>
                                  </span>
                                </span>
                                {done && <CheckCircleIcon />}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <EmptyState icon={ClipboardList} title={analysis.actions.length ? "No matching tasks" : "No action items yet"} description={analysis.actions.length ? "Try changing the search or urgency filter." : "Action-like phrases detected in the conversation will appear here."} />
                      )}
                      {analysis.actions.length > 0 && <p className="text-xs text-slate-500">{completedCount} of {analysis.actions.length} tasks marked complete. Completion state stays in this page session.</p>}
                    </div>
                  )}

                  {activeTab === "matrix" && (
                    <div id="panel-matrix" role="tabpanel" aria-labelledby="tab-matrix" className="space-y-4">
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { name: "High", count: analysis.alerts.filter((item) => item.urgency === "High").length, tone: "red", icon: ArrowUpRight, note: "Review first" },
                          { name: "Medium", count: analysis.alerts.filter((item) => item.urgency === "Medium").length, tone: "amber", icon: Activity, note: "Plan next" },
                          { name: "Low", count: analysis.alerts.filter((item) => item.urgency === "Low").length, tone: "slate", icon: ArrowDownRight, note: "Keep in view" },
                        ].map((group) => {
                          const Icon = group.icon;
                          return (
                            <div key={group.name} className={cx("rounded-xl border p-3", group.tone === "red" ? "border-rose-200 bg-rose-50/70" : group.tone === "amber" ? "border-amber-200 bg-amber-50/70" : "border-slate-200 bg-slate-50")}>
                              <div className="flex items-center justify-between gap-1">
                                <p className={cx("text-xs font-bold", group.tone === "red" ? "text-rose-800" : group.tone === "amber" ? "text-amber-800" : "text-slate-700")}>{group.name}</p>
                                <Icon size={14} aria-hidden="true" />
                              </div>
                              <p className="mt-2 text-2xl font-extrabold tabular-nums">{group.count}</p>
                              <p className="mt-1 text-[10px] text-slate-500">{group.note}</p>
                            </div>
                          );
                        })}
                      </div>
                      {analysis.alerts.length ? (
                        <div className="space-y-2">
                          {["High", "Medium", "Low"].map((level) => {
                            const items = analysis.alerts.filter((item) => item.urgency === level);
                            if (!items.length) return null;
                            return (
                              <div key={level}>
                                <div className="mb-2 flex items-center gap-2">
                                  <span className={cx("h-2 w-2 rounded-full", level === "High" ? "bg-rose-500" : level === "Medium" ? "bg-amber-500" : "bg-slate-400")} />
                                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">{level} priority</h3>
                                  <span className="text-xs text-slate-400">{items.length}</span>
                                </div>
                                <div className="space-y-2">
                                  {items.slice(0, 6).map((item) => (
                                    <div key={`${item.kind}-${item.id}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
                                      <div className={cx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", level === "High" ? "bg-rose-50 text-rose-700" : level === "Medium" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>
                                        {item.kind === "Deadline" ? <Clock3 size={15} /> : item.kind === "Mention" ? <Hash size={15} /> : <ClipboardList size={15} />}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="mb-1 flex flex-wrap items-center gap-2">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.kind}</span>
                                          {item.owner && <span className="text-[10px] text-slate-400">· {item.owner}</span>}
                                        </div>
                                        <p className="break-words text-xs leading-5 text-slate-700">{item.text}</p>
                                      </div>
                                    </div>
                                  ))}
                                  {items.length > 6 && <p className="pl-1 text-xs text-slate-400">+ {items.length - 6} more {level.toLowerCase()}-priority signals</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <EmptyState icon={Target} title="Urgency matrix is empty" description="Load a template or paste chat text to map messages by urgency." />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <footer className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-600" /> Local processing · No chat text is uploaded by this component</p>
            <p>missed. · ProtocolX concept prototype · Rule-based extraction, not a hosted LLM</p>
          </footer>
        </main>
      </div>
    </div>
  );
}

function CheckCircleIcon() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-label="Completed">
      <Check size={12} strokeWidth={3} aria-hidden="true" />
    </span>
  );
}
