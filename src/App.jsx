import React, { useRef, useState } from "react";
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
  Cpu,
  Download,
  FileText,
  Filter,
  Hash,
  LockKeyhole,
  LoaderCircle,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  MAX_ANALYSIS_CHARACTERS,
  MODEL_ID,
  analyzeTextLocally,
  checkLocalModelSupport,
} from "./lib/localAiEngine.js";
import { createEmptyAnalysis } from "./lib/analysisSchema.js";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Badge({ children, tone = "slate", className = "" }) {
  const tones = {
    slate: "border-slate-600/60 bg-slate-800/70 text-slate-300",
    green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    red: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    blue: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
    violet: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  };
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", tones[tone] || tones.slate, className)}>
      {children}
    </span>
  );
}

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p>}
        <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, caption, tone = "blue" }) {
  const styles = {
    blue: "bg-cyan-400/10 text-cyan-200 ring-cyan-300/20 shadow-[0_0_28px_rgba(34,211,238,0.08)]",
    rose: "bg-rose-400/10 text-rose-200 ring-rose-300/20 shadow-[0_0_28px_rgba(244,63,94,0.08)]",
    violet: "bg-violet-400/10 text-violet-200 ring-violet-300/20 shadow-[0_0_28px_rgba(139,92,246,0.10)]",
  };
  return (
    <div className="group rounded-2xl border border-slate-700/50 bg-slate-900/40 p-4 shadow-[0_12px_40px_rgba(2,6,23,0.22)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:border-slate-600/80 hover:bg-slate-900/65 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white tabular-nums">{value}</p>
        </div>
        <div className={cx("rounded-xl p-2.5 ring-1 transition-transform duration-200 group-hover:scale-110", styles[tone])}>
          <Icon size={19} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{caption}</p>
    </div>
  );
}

function EmptyState({ icon: Icon = FileText, title, description }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/35 px-6 py-8 text-center">
      <div className="mb-3 rounded-xl bg-slate-900 p-3 text-slate-500 ring-1 ring-slate-700">
        <Icon size={22} aria-hidden="true" />
      </div>
      <p className="font-semibold text-slate-200">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

function urgencyTone(urgency) {
  if (urgency === "High") return "red";
  if (urgency === "Medium") return "amber";
  return "slate";
}

function ProgressMeter({ meter }) {
  const Icon = meter.icon;
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meter.toneClass)}>
            <Icon size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-100">{meter.label}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{meter.description}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold tabular-nums text-white">{meter.percent}%</p>
          <p className="text-[10px] text-slate-400">{meter.count} / {meter.total} rows</p>
        </div>
      </div>
      <div
        className="mt-4 h-2.5 overflow-hidden rounded-full border border-slate-700/60 bg-slate-950/80"
        role="progressbar"
        aria-label={meter.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={meter.percent}
        aria-valuetext={`${meter.percent}% of ${meter.total} non-empty rows`}
      >
        <div className={cx("h-full rounded-full transition-[width] duration-700 ease-out", meter.fillClass, meter.glowClass)} style={{ width: `${meter.percent}%` }} />
      </div>
    </div>
  );
}

export default function App() {
  const [chatText, setChatText] = useState("");
  const [activeTab, setActiveTab] = useState("summary");
  const [taskStates, setTaskStates] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("All");
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState("");
  const [fileStatus, setFileStatus] = useState({ type: "", message: "" });
  const [exportStatus, setExportStatus] = useState({ type: "", message: "" });
  const [analysisStatus, setAnalysisStatus] = useState({ type: "", message: "" });
  const [analysis, setAnalysis] = useState(createEmptyAnalysis);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modelState, setModelState] = useState({ state: "not-loaded", progress: 0, message: "Model not loaded yet" });
  const fileInputRef = useRef(null);
  const activeRunRef = useRef(0);

  const runtimeSupport = checkLocalModelSupport();
  const completedCount = analysis.actions.filter((task) => taskStates[task.id]).length;
  const openTasks = analysis.actions.filter((task) => !taskStates[task.id]);
  const highAlerts = analysis.alerts.filter((item) => item.urgency === "High").length;
  const missedMentions = analysis.mentions.length;
  const lineCount = analysis.lineCount;
  const toPercent = (value, total) => total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;

  const analyticsMeters = [
    {
      id: "urgent-lines",
      label: "High-urgency rows",
      count: analysis.urgentRows.length,
      total: lineCount,
      percent: toPercent(analysis.urgentRows.length, lineCount),
      description: "Rows classified by local AI",
      fillClass: "bg-rose-400",
      glowClass: "shadow-[0_0_15px_rgba(244,63,94,0.38)]",
      icon: AlertCircle,
      toneClass: "bg-rose-400/10 text-rose-200",
    },
    {
      id: "action-items",
      label: "Action items",
      count: analysis.actions.length,
      total: lineCount,
      percent: toPercent(analysis.actions.length, lineCount),
      description: "Potential tasks extracted by model",
      fillClass: "bg-indigo-400",
      glowClass: "shadow-[0_0_15px_rgba(99,102,241,0.4)]",
      icon: ClipboardList,
      toneClass: "bg-indigo-400/10 text-indigo-200",
    },
    {
      id: "deadline-rows",
      label: "Deadline signals",
      count: analysis.deadlines.length,
      total: lineCount,
      percent: toPercent(analysis.deadlines.length, lineCount),
      description: "Rows with extracted time references",
      fillClass: "bg-amber-300",
      glowClass: "shadow-[0_0_15px_rgba(252,211,77,0.35)]",
      icon: CalendarClock,
      toneClass: "bg-amber-300/10 text-amber-200",
    },
  ];

  const filteredActions = analysis.actions.filter((task) => {
    const matchesSearch = task.text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUrgency = urgencyFilter === "All" || task.urgency === urgencyFilter;
    return matchesSearch && matchesUrgency;
  });

  function resetAnalysis() {
    activeRunRef.current += 1;
    setAnalysis(createEmptyAnalysis());
    setHasAnalysis(false);
    setTaskStates({});
    setActiveTab("summary");
    setSearchQuery("");
    setUrgencyFilter("All");
    setExportStatus({ type: "", message: "" });
    setAnalysisStatus({ type: "", message: "" });
  }

  function handleTextChange(value) {
    setChatText(value);
    setLoadedFileName("");
    setFileStatus({ type: "", message: "" });
    resetAnalysis();
  }

  function handleLocalFile(file) {
    setFileStatus({ type: "", message: "" });
    if (isAnalyzing) {
      setFileStatus({ type: "error", message: "Wait for the current local analysis to finish before loading another file." });
      return;
    }
    if (!file) return;

    const name = file.name.toLowerCase();
    const supported = name.endsWith(".txt") || name.endsWith(".log");
    const maxBytes = 5 * 1024 * 1024;

    if (!supported) {
      setFileStatus({ type: "error", message: "Unsupported file type. Choose a .txt or .log file." });
      return;
    }
    if (file.size > maxBytes) {
      setFileStatus({ type: "error", message: "The file exceeds the 5 MB upload limit. Choose a smaller text log." });
      return;
    }
    if (typeof FileReader === "undefined") {
      setFileStatus({ type: "error", message: "FileReader is unavailable in this browser." });
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        if (isAnalyzing) {
          setFileStatus({ type: "error", message: "A file finished reading while analysis was running. Wait for analysis to finish, then load it again." });
          return;
        }
        if (typeof reader.result !== "string") {
          setFileStatus({ type: "error", message: "The file did not decode as text. Try UTF-8 plain text." });
          return;
        }
        setChatText(reader.result);
        setLoadedFileName(file.name);
        resetAnalysis();
        setFileStatus({ type: "success", message: `Loaded ${file.name} locally. Run local AI analysis when ready.` });
      };
      reader.onerror = () => setFileStatus({ type: "error", message: "The selected file could not be read." });
      reader.onabort = () => setFileStatus({ type: "error", message: "File reading was cancelled." });
      reader.readAsText(file, "UTF-8");
    } catch {
      setFileStatus({ type: "error", message: "Unable to open this file. Try another text log." });
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    if (isAnalyzing) {
      setFileStatus({ type: "error", message: "Wait for the current local analysis to finish before dropping another file." });
      return;
    }
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      setFileStatus({ type: "error", message: "No file was detected. Drop a .txt or .log file here." });
      return;
    }
    handleLocalFile(file);
  }

  async function runAnalysis() {
    const source = chatText.trim();
    if (!source) {
      setAnalysisStatus({ type: "error", message: "Paste or upload a chat log before running analysis." });
      return;
    }
    if (source.length > MAX_ANALYSIS_CHARACTERS) {
      setAnalysisStatus({ type: "error", message: `This log is too large for a safe interactive run (${source.length.toLocaleString()} characters). Split it into smaller files or keep it under ${MAX_ANALYSIS_CHARACTERS.toLocaleString()} characters.` });
      return;
    }
    if (!runtimeSupport.supported) {
      setAnalysisStatus({ type: "error", message: runtimeSupport.reason });
      return;
    }

    const runId = ++activeRunRef.current;
    setIsAnalyzing(true);
    setHasAnalysis(false);
    setAnalysis(createEmptyAnalysis());
    setAnalysisStatus({ type: "progress", message: "Starting local model…" });
    setModelState({ state: "loading", progress: 0, message: "Preparing browser-local model" });

    try {
      const result = await analyzeTextLocally(source, (event) => {
        if (runId !== activeRunRef.current) return;
        if (event.stage === "model") {
          const progress = typeof event.progress === "number" ? Math.round(event.progress * 100) : 0;
          setModelState({ state: "loading", progress: Math.max(0, Math.min(100, progress)), message: event.message || "Downloading and initializing local model" });
          setAnalysisStatus({ type: "progress", message: event.message || "Preparing local AI model" });
        } else {
          setModelState((current) => ({ ...current, state: "ready", progress: 100, message: "Local model ready" }));
          setAnalysisStatus({ type: "progress", message: event.message || "Analyzing conversation locally" });
        }
      });

      if (runId !== activeRunRef.current) return;
      setAnalysis(result);
      setHasAnalysis(true);
      setTaskStates({});
      setModelState({ state: "ready", progress: 100, message: "Local model ready · weights cached by browser" });
      setAnalysisStatus({ type: "success", message: `Analysis complete on this device · ${result.sourceChunks} segment${result.sourceChunks === 1 ? "" : "s"} processed.` });
      setActiveTab("summary");
    } catch (error) {
      if (runId !== activeRunRef.current) return;
      setModelState((current) => ({ ...current, state: "error", message: "Local model unavailable" }));
      setAnalysisStatus({ type: "error", message: error instanceof Error ? error.message : "Local analysis failed. Check WebGPU support and try again." });
    } finally {
      if (runId === activeRunRef.current) setIsAnalyzing(false);
    }
  }

  function toggleTask(id) {
    setTaskStates((current) => ({ ...current, [id]: !current[id] }));
  }

  function downloadExecutiveBrief() {
    setExportStatus({ type: "", message: "" });
    if (!chatText.trim() || !hasAnalysis) {
      setExportStatus({ type: "error", message: "Run local AI analysis before exporting the brief." });
      return;
    }

    const generatedAt = new Date().toLocaleString();
    const taskLines = analysis.actions.length
      ? analysis.actions.map((task) => {
          const due = task.dueDate ? ` · Due signal: ${task.dueDate}` : "";
          const owner = task.owner ? ` · Assigned to: ${task.owner}` : " · Assignment not explicit";
          const confidence = typeof task.confidence === "number" ? ` · Confidence: ${Math.round(task.confidence * 100)}%` : "";
          return `- [${taskStates[task.id] ? "x" : " "}] **${task.urgency}** — ${task.text}${due}${owner}${confidence}`;
        })
      : ["- No action items were extracted."];
    const urgentLines = analysis.urgentRows.length
      ? analysis.urgentRows.map((row) => `> ${row.text}${row.reason ? ` — ${row.reason}` : ""}`)
      : ["> No high-urgency rows were extracted."];
    const mentionLines = analysis.mentions.length
      ? analysis.mentions.map((mention) => `- **@${mention.handle}** — ${mention.line}`)
      : ["- No direct mentions were extracted."];
    const deadlineLines = analysis.deadlines.length
      ? analysis.deadlines.map((deadline) => `- **${deadline.dates.join(", ") || "Time reference"}** — ${deadline.text}`)
      : ["- No deadline signals were extracted."];
    const decisionLines = analysis.decisions.length
      ? analysis.decisions.map((decision) => `- ${decision}`)
      : ["- No decisions were extracted."];

    const markdown = [
      "# Unread Radar AI — Local Executive Brief",
      "",
      `- **Generated:** ${generatedAt}`,
      `- **Source:** ${loadedFileName || "Pasted conversation"}`,
      `- **Model:** ${MODEL_ID}`,
      "- **Processing:** On-device WebGPU inference; chat content is not sent to an AI API",
      "",
      "## Executive Summary",
      "",
      ...(analysis.summary.length ? analysis.summary.map((item) => `- ${item}`) : ["- No summary was returned by the local model."]),
      "",
      "## Operational Index Analytics",
      "",
      `- **Non-empty rows:** ${analysis.lineCount}`,
      `- **Total alerts:** ${analysis.alerts.length}`,
      `- **High-urgency rows:** ${analysis.urgentRows.length} (${toPercent(analysis.urgentRows.length, lineCount)}%)`,
      `- **Action items:** ${analysis.actions.length} (${toPercent(analysis.actions.length, lineCount)}% of rows)`,
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
      "## Decisions",
      "",
      ...decisionLines,
      "",
      "---",
      "Generated by Unread Radar AI using a language model running locally in the browser. AI extraction may be wrong; verify important items against the source.",
      "",
    ].join("\n");

    let objectUrl = "";
    let anchor = null;
    try {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      objectUrl = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "unread-radar-brief.md";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      setExportStatus({ type: "success", message: "Local executive brief downloaded as unread-radar-brief.md." });
    } catch {
      setExportStatus({ type: "error", message: "The report could not be downloaded in this browser." });
    } finally {
      if (anchor?.parentNode) anchor.parentNode.removeChild(anchor);
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }

  async function copySummary() {
    const content = [
      "UNREAD RADAR AI — LOCAL SUMMARY",
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
      setAnalysisStatus({ type: "error", message: "Clipboard access was blocked. Select and copy the results manually." });
    }
  }

  const tabs = [
    { id: "summary", label: "AI Summary", icon: Sparkles, count: analysis.summary.length },
    { id: "tasks", label: "Action items", icon: ClipboardList, count: analysis.actions.length },
    { id: "matrix", label: "Urgency matrix", icon: Target, count: analysis.alerts.length },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 selection:bg-cyan-300/30 selection:text-white">
      <div className="pointer-events-none fixed inset-0 -z-0 opacity-[0.16]" aria-hidden="true" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)", backgroundSize: "42px 42px" }} />
      <div className="pointer-events-none fixed -left-48 top-0 -z-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none fixed -right-40 top-24 -z-0 h-[32rem] w-[32rem] rounded-full bg-indigo-500/15 blur-3xl" aria-hidden="true" />
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-700/50 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-slate-900/80 text-cyan-200 shadow-[0_0_28px_rgba(34,211,238,0.15)]"><Command size={22} strokeWidth={2.2} aria-hidden="true" /></div>
            <div>
              <div className="flex items-center gap-2"><p className="text-lg font-extrabold tracking-tight text-white">unread radar</p><Badge tone="violet">ProtocolX</Badge></div>
              <p className="text-xs font-medium text-slate-400">On-device conversation intelligence</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green"><ShieldCheck size={14} aria-hidden="true" /> Chat stays on device</Badge>
            <Badge tone={modelState.state === "ready" ? "green" : modelState.state === "error" ? "red" : "blue"}><Cpu size={14} aria-hidden="true" /> {modelState.state === "ready" ? "Local model ready" : modelState.state === "loading" ? "Loading model" : modelState.state === "error" ? "Model needs attention" : "Local model not loaded"}</Badge>
          </div>
        </header>

        <main>
          <section className="grid gap-8 py-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-cyan-200 shadow-[0_0_25px_rgba(34,211,238,0.08)]"><Sparkles size={14} aria-hidden="true" /> Local AI workspace</div>
              <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.7rem]">Catch up on what <span className="block bg-gradient-to-r from-cyan-200 via-indigo-300 to-violet-300 bg-clip-text text-transparent">actually matters.</span></h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">Extract tasks, decisions, deadlines, mentions, and urgency from raw conversations using a language model that runs in your browser.</p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-slate-300">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-900/55 px-2.5 py-2"><LockKeyhole size={14} className="text-emerald-300" /> Local inference</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-900/55 px-2.5 py-2"><Activity size={14} className="text-cyan-300" /> Context-aware extraction</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-900/55 px-2.5 py-2"><CheckCheck size={14} className="text-violet-300" /> Task tracking</span>
              </div>
            </div>
            <div className="rounded-2xl border border-indigo-300/15 bg-slate-900/45 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.25)] backdrop-blur-xl sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-300/20"><Cpu size={19} aria-hidden="true" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-white">On-device model</h2>
                  <p className="mt-1 break-all text-xs leading-5 text-slate-400">{MODEL_ID}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone={runtimeSupport.supported ? "green" : "red"}>{runtimeSupport.supported ? "WebGPU available" : "WebGPU unavailable"}</Badge><Badge tone="slate">No chat API</Badge></div>
                </div>
              </div>
              {modelState.state === "loading" && <div className="mt-4"><div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-400"><span>{modelState.message}</span><span className="tabular-nums">{modelState.progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400 transition-[width] duration-300" style={{ width: `${modelState.progress}%` }} /></div></div>}
              <p className="mt-4 text-xs leading-5 text-slate-400">First use downloads model weights and caches them in the browser. This may take time and requires WebGPU-compatible hardware. Your chat text is processed locally and is not sent to the model host.</p>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
            <div className="rounded-2xl border border-slate-700/50 bg-slate-900/45 p-4 shadow-[0_18px_55px_rgba(2,6,23,0.26)] backdrop-blur-xl sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-400/10 text-indigo-200 ring-1 ring-indigo-300/20"><MessageSquareText size={17} aria-hidden="true" /></div><h2 className="font-bold text-white">Conversation input</h2></div><p className="mt-2 text-sm leading-6 text-slate-400">Paste raw chat text or import a local text log. No sample conversations are preloaded.</p></div>
                <Badge tone="green"><LockKeyhole size={12} /> Local</Badge>
              </div>
              <div onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }} onDrop={handleDrop} className={cx("mb-4 rounded-xl border-2 border-dashed p-4 transition-colors", isDragging ? "border-cyan-300 bg-cyan-300/10 ring-4 ring-cyan-300/10" : "border-slate-700 bg-slate-950/45 hover:border-cyan-300/50 hover:bg-slate-950/65")} role="region" aria-label="Local chat log file upload">
                <input ref={fileInputRef} type="file" accept=".txt,.log,text/plain" className="sr-only" aria-label="Choose a local .txt or .log chat file" disabled={isAnalyzing} onChange={(event) => { handleLocalFile(event.target.files?.[0]); event.target.value = ""; }} />
                <div className="flex flex-col items-center justify-center gap-2 text-center sm:flex-row sm:text-left"><span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", isDragging ? "bg-cyan-300 text-slate-950" : "bg-slate-900 text-cyan-200 ring-1 ring-slate-700")}><Upload size={21} aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-200">Drop a .txt or .log file here</p><p className="mt-1 text-xs leading-5 text-slate-400">Read locally in the browser · 5 MB file limit</p>{loadedFileName && <p className="mt-1 truncate text-xs font-semibold text-emerald-300">Loaded: {loadedFileName}</p>}</div><button type="button" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"><FileText size={14} aria-hidden="true" /> Browse files</button></div>
                {fileStatus.message && <p className={cx("mt-3 rounded-lg px-3 py-2 text-xs leading-5", fileStatus.type === "error" ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200")} role={fileStatus.type === "error" ? "alert" : "status"} aria-live="polite">{fileStatus.message}</p>}
              </div>
              <label htmlFor="chat-log" className="mb-2 block text-sm font-semibold text-slate-200">Chat log</label>
              <textarea id="chat-log" value={chatText} disabled={isAnalyzing} onChange={(event) => handleTextChange(event.target.value)} placeholder="Paste or drop a raw conversation here…" rows={15} spellCheck="false" className="w-full resize-y rounded-xl border border-slate-700/70 bg-slate-950/75 px-4 py-3 font-mono text-xs leading-6 text-slate-100 shadow-inner shadow-black/20 placeholder:font-sans placeholder:text-slate-500 focus:border-cyan-300/70 focus:bg-slate-950 focus:outline-none focus:ring-4 focus:ring-indigo-400/20" />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400"><span>{chatText.length.toLocaleString()} characters · {chatText.split(/\r?\n/).filter((line) => line.trim()).length} non-empty rows</span><button type="button" onClick={() => { handleTextChange(""); setLoadedFileName(""); setFileStatus({ type: "", message: "" }); }} disabled={!chatText || isAnalyzing} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-slate-400 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><X size={13} /> Clear input</button></div>
              <button type="button" onClick={runAnalysis} disabled={!chatText.trim() || isAnalyzing || !runtimeSupport.supported} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200/20 bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500 px-4 py-3 text-sm font-extrabold text-white shadow-[0_0_30px_rgba(99,102,241,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_38px_rgba(34,211,238,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0">
                {isAnalyzing ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
                {isAnalyzing ? "Running locally…" : modelState.state === "ready" ? "Analyze with local AI" : "Load model & analyze locally"}
              </button>
              {analysisStatus.message && <p className={cx("mt-3 rounded-lg px-3 py-2.5 text-xs leading-5", analysisStatus.type === "error" ? "bg-rose-400/10 text-rose-200" : analysisStatus.type === "success" ? "bg-emerald-400/10 text-emerald-200" : "bg-cyan-300/10 text-cyan-100")} role={analysisStatus.type === "error" ? "alert" : "status"} aria-live="polite">{analysisStatus.message}</p>}
              <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3.5"><div className="flex items-start gap-2.5"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" /><div><p className="text-xs font-bold text-emerald-200">Privacy model</p><p className="mt-1 text-xs leading-5 text-emerald-100/75">The first run downloads model weights. Inference runs on this device; conversation contents are not posted to a cloud AI endpoint. Model downloading requires an internet connection the first time.</p></div></div></div>
            </div>

            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><MetricCard icon={Bell} label="Total alerts" value={hasAnalysis ? analysis.alerts.length : "—"} caption={hasAnalysis ? `${highAlerts} high-priority signals` : "Run local analysis to calculate"} tone="rose" /><MetricCard icon={ClipboardList} label="Extracted tasks" value={hasAnalysis ? analysis.actions.length : "—"} caption={hasAnalysis ? `${completedCount} completed · ${openTasks.length} open` : "Generated from your chat"} tone="blue" /><MetricCard icon={Hash} label="Mentions" value={hasAnalysis ? missedMentions : "—"} caption="Direct handles identified by model" tone="violet" /></div>

              <section className="rounded-2xl border border-slate-700/50 bg-slate-900/45 p-4 shadow-[0_18px_55px_rgba(2,6,23,0.26)] backdrop-blur-xl sm:p-5" aria-labelledby="operational-index-heading">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-indigo-300">Live metrics</p><h2 id="operational-index-heading" className="text-lg font-bold tracking-tight text-white">Operational Index Analytics</h2><p className="mt-1 text-xs leading-5 text-slate-400">Metrics are based on completed local-model analysis.</p></div><button type="button" onClick={downloadExecutiveBrief} disabled={!hasAnalysis} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-indigo-300/30 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-[0_0_28px_rgba(99,102,241,0.24)] transition-all hover:-translate-y-0.5 hover:from-indigo-400 hover:via-violet-400 hover:to-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"><Download size={15} aria-hidden="true" /> Download Local Executive Brief (.md)</button></div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">{analyticsMeters.map((meter) => <ProgressMeter key={meter.id} meter={meter} />)}</div>
                {exportStatus.message && <p className={cx("mt-4 rounded-lg px-3 py-2 text-xs leading-5", exportStatus.type === "error" ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200")} role={exportStatus.type === "error" ? "alert" : "status"} aria-live="polite">{exportStatus.message}</p>}
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/45 shadow-[0_18px_55px_rgba(2,6,23,0.26)] backdrop-blur-xl">
                <div className="border-b border-slate-700/50 px-4 pt-4 sm:px-5"><SectionHeading eyebrow="Your catch-up brief" title="Signal over noise" description="Findings are generated by the on-device language model, then validated and normalized locally." action={<button type="button" onClick={copySummary} disabled={!hasAnalysis} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-300/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy brief"}</button>} />
                  <div className="mt-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Analysis views">{tabs.map((tab) => { const Icon = tab.icon; const selected = activeTab === tab.id; return <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={cx("inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300 sm:px-4", selected ? "border-cyan-300 text-cyan-100" : "border-transparent text-slate-400 hover:border-slate-500 hover:text-slate-200")}><Icon size={15} aria-hidden="true" />{tab.label}<span className={cx("rounded-md px-1.5 py-0.5 text-[10px]", selected ? "bg-cyan-300/10 text-cyan-100" : "bg-slate-800 text-slate-400")}>{hasAnalysis ? tab.count : "—"}</span></button>; })}</div>
                </div>
                <div className="p-4 sm:p-5">
                  {activeTab === "summary" && <div id="panel-summary" role="tabpanel" aria-labelledby="tab-summary" className="space-y-4">{!hasAnalysis ? <EmptyState icon={Sparkles} title="Your AI brief will appear here" description="Paste or upload a conversation, then load the local model and run analysis. No sample chats or keyword parser are used." /> : <><div className="rounded-xl border border-indigo-300/15 bg-gradient-to-br from-indigo-500/10 to-cyan-400/[0.04] p-4"><div className="mb-3 flex flex-wrap items-center gap-2 text-cyan-100"><Sparkles size={17} aria-hidden="true" /><h3 className="text-sm font-bold">Local AI summary</h3><Badge tone="blue">{analysis.modelId || MODEL_ID}</Badge></div><ul className="space-y-3">{analysis.summary.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2.5 text-sm leading-6 text-slate-200"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" /><span>{item}</span></li>)}</ul>{analysis.summary.length === 0 && <p className="text-sm text-slate-400">The model returned no summary items.</p>}</div>
                    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3.5"><div className="mb-2 flex items-center gap-2 text-slate-200"><CalendarClock size={16} className="text-indigo-300" /><p className="text-xs font-bold">Deadlines and timing</p></div>{analysis.deadlines.length ? <ul className="space-y-3">{analysis.deadlines.slice(0, 6).map((item) => <li key={item.id} className="text-xs leading-5 text-slate-300"><Badge tone={urgencyTone(item.urgency)}>{item.dates.join(", ") || "Time reference"}</Badge><p className="mt-1.5">{item.text}</p></li>)}</ul> : <p className="text-xs leading-5 text-slate-500">No deadline signals returned.</p>}</div>
                      <div className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3.5"><div className="mb-2 flex items-center gap-2 text-slate-200"><Users size={16} className="text-violet-300" /><p className="text-xs font-bold">Direct mentions</p></div>{analysis.mentions.length ? <ul className="space-y-2">{analysis.mentions.slice(0, 8).map((item, index) => <li key={`${item.handle}-${index}`} className="text-xs leading-5 text-slate-300"><span className="font-bold text-violet-200">@{item.handle}</span><p className="mt-0.5">{item.line}</p></li>)}</ul> : <p className="text-xs leading-5 text-slate-500">No direct mentions returned.</p>}</div></div>
                    <p className="flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-100/90"><AlertCircle size={15} className="mt-0.5 shrink-0" />AI output can contain errors. Verify important dates, owners, decisions, and urgency classifications against the original conversation.</p></>}</div>}

                  {activeTab === "tasks" && <div id="panel-tasks" role="tabpanel" aria-labelledby="tab-tasks" className="space-y-4">{!hasAnalysis ? <EmptyState icon={ClipboardList} title="No analyzed tasks" description="Run local AI analysis to extract and track candidate action items." /> : <><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" /><label htmlFor="task-search" className="sr-only">Search action items</label><input id="task-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search extracted tasks…" className="w-full rounded-lg border border-slate-700 bg-slate-950/50 py-2.5 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/60 focus:outline-none focus:ring-4 focus:ring-indigo-400/15" /></div><div className="relative"><Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" /><label htmlFor="urgency-filter" className="sr-only">Filter by urgency</label><select id="urgency-filter" value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value)} className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950/70 py-2.5 pl-9 pr-8 text-xs font-semibold text-slate-200 focus:border-cyan-300/60 focus:outline-none focus:ring-4 focus:ring-indigo-400/15"><option>All</option><option>High</option><option>Medium</option><option>Low</option></select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" /></div></div>
                    {filteredActions.length ? <div className="space-y-2">{filteredActions.map((task) => { const done = Boolean(taskStates[task.id]); return <label key={task.id} className={cx("flex cursor-pointer gap-3 rounded-xl border p-3.5 transition", done ? "border-emerald-300/20 bg-emerald-400/[0.05]" : "border-slate-700/60 bg-slate-950/30 hover:border-indigo-300/30 hover:bg-slate-950/55")}><input type="checkbox" checked={done} onChange={() => toggleTask(task.id)} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 text-indigo-400 focus:ring-indigo-400" /><span className="min-w-0 flex-1"><span className={cx("block text-sm leading-6", done ? "text-slate-500 line-through" : "text-slate-200")}>{task.text}</span><span className="mt-2 flex flex-wrap items-center gap-2"><Badge tone={urgencyTone(task.urgency)}>{task.urgency} priority</Badge><span className="text-[11px] text-slate-400">{task.owner ? `Assignment: ${task.owner}` : "Assignment not explicit"}</span>{task.dueDate && <span className="text-[11px] text-cyan-200">Due signal: {task.dueDate}</span>}{typeof task.confidence === "number" && <span className="text-[11px] text-slate-500">Model confidence {Math.round(task.confidence * 100)}%</span>}</span>{task.evidence && <span className="mt-2 block text-[11px] leading-5 text-slate-500">Evidence: {task.evidence}</span>}</span>{done && <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-200"><Check size={12} strokeWidth={3} aria-hidden="true" /></span>}</label>; })}</div> : <EmptyState icon={ClipboardList} title={analysis.actions.length ? "No matching tasks" : "No action items returned"} description={analysis.actions.length ? "Try a different query or urgency level." : "The local model did not identify action items in this log."} />}
                    {analysis.actions.length > 0 && <p className="text-xs text-slate-400">{completedCount} of {analysis.actions.length} tasks checked complete. Checklist state lasts for this page session.</p>}</>}</div>}

                  {activeTab === "matrix" && <div id="panel-matrix" role="tabpanel" aria-labelledby="tab-matrix" className="space-y-4">{!hasAnalysis ? <EmptyState icon={Target} title="Urgency matrix is waiting" description="Run local AI analysis to classify messages and display priority signals." /> : <><div className="grid grid-cols-3 gap-2">{[{ name: "High", count: analysis.alerts.filter((item) => item.urgency === "High").length, tone: "red", icon: ArrowUpRight, note: "Review first" }, { name: "Medium", count: analysis.alerts.filter((item) => item.urgency === "Medium").length, tone: "amber", icon: Activity, note: "Plan next" }, { name: "Low", count: analysis.alerts.filter((item) => item.urgency === "Low").length, tone: "slate", icon: ArrowDownRight, note: "Keep in view" }].map((group) => { const Icon = group.icon; return <div key={group.name} className={cx("rounded-xl border p-3", group.tone === "red" ? "border-rose-300/20 bg-rose-400/[0.06]" : group.tone === "amber" ? "border-amber-300/20 bg-amber-300/[0.05]" : "border-slate-700/60 bg-slate-950/35")}><div className="flex items-center justify-between gap-1"><p className={cx("text-xs font-bold", group.tone === "red" ? "text-rose-200" : group.tone === "amber" ? "text-amber-200" : "text-slate-300")}>{group.name}</p><Icon size={14} aria-hidden="true" /></div><p className="mt-2 text-2xl font-extrabold tabular-nums text-white">{group.count}</p><p className="mt-1 text-[10px] text-slate-400">{group.note}</p></div>; })}</div>
                    {analysis.alerts.length ? <div className="space-y-4">{["High", "Medium", "Low"].map((level) => { const items = analysis.alerts.filter((item) => item.urgency === level); if (!items.length) return null; return <div key={level}><div className="mb-2 flex items-center gap-2"><span className={cx("h-2 w-2 rounded-full", level === "High" ? "bg-rose-400" : level === "Medium" ? "bg-amber-300" : "bg-slate-400")} /><h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{level} priority</h3><span className="text-xs text-slate-500">{items.length}</span></div><div className="space-y-2">{items.slice(0, 8).map((item) => <div key={`${item.kind}-${item.id}`} className="flex gap-3 rounded-xl border border-slate-700/60 bg-slate-950/35 p-3"><div className={cx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", level === "High" ? "bg-rose-400/10 text-rose-200" : level === "Medium" ? "bg-amber-300/10 text-amber-200" : "bg-slate-800 text-slate-300")}>{item.kind === "Deadline" ? <Clock3 size={15} /> : item.kind === "Mention" ? <Hash size={15} /> : item.kind === "Urgent message" ? <AlertCircle size={15} /> : <ClipboardList size={15} />}</div><div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.kind}</span>{item.owner && <span className="text-[10px] text-slate-500">· {item.owner}</span>}</div><p className="break-words text-xs leading-5 text-slate-200">{item.text}</p>{item.reason && <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.reason}</p>}</div></div>)}</div></div>; })}</div> : <EmptyState icon={Target} title="No alert signals returned" description="The local model did not return any classified tasks, deadlines, mentions, or urgent rows." />}
                  </>}</div>}
                </div>
              </section>
            </div>
          </section>

          <footer className="mt-8 flex flex-col gap-3 border-t border-slate-700/50 pt-5 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between"><p className="inline-flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-300" /> Chat analysis runs in the browser · No chat API calls</p><p>Unread Radar AI · WebGPU local inference · Model weights fetched on first use</p></footer>
        </main>
      </div>
    </div>
  );
}
