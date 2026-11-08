import React, { useEffect, useRef, useState } from "react";
import { Activity, AlertCircle, ArrowDownRight, ArrowUpRight, Bell, CalendarClock, Check, CheckCheck, ChevronDown, ClipboardList, Command, Copy, Cpu, Download, FileText, Filter, Hash, LockKeyhole, LoaderCircle, MessageSquareText, Search, ShieldCheck, Sparkles, Target, Upload, Users, X } from "lucide-react";
import { MAX_ANALYSIS_CHARACTERS, MODEL_ID, analyzeTextByMode, checkLocalModelSupport, clearLegacySessionCache, invalidateAnalysisWork } from "./lib/ai/localAiEngine.js";
import { createEmptyAnalysis } from "./lib/ai/analysisSchema.js";
import { createSourceSnapshot } from "./lib/import/sourceSnapshot.js";
import { cx, urgencyTone, describeImportWarnings, toPercent } from "./lib/ui/format.js";
import { Badge } from "./components/ui/Badge.jsx";
import { SectionHeading } from "./components/ui/SectionHeading.jsx";
import { MetricCard } from "./components/ui/MetricCard.jsx";
import { EmptyState } from "./components/ui/EmptyState.jsx";
import { ProgressMeter } from "./components/ui/ProgressMeter.jsx";
import { TaskCard } from "./components/TaskCard.jsx";
import { PriorityItem } from "./components/PriorityItem.jsx";
import { ReviewQueue } from "./components/ReviewQueue.jsx";
import { ImportReview } from "./components/ImportReview.jsx";
import { OutcomeFilter } from "./components/OutcomeFilter.jsx";
import { TASK_STATUSES, TASK_STATUS_LABELS, countTaskStatuses, getTaskStatus, updateTaskStatus } from "./lib/views/taskWorkflow.js";
import { buildPriorityView } from "./lib/views/priorityView.js";
import { buildExecutiveBrief, buildCopySummary } from "./lib/export/report.js";

function formatDurationMs(value) {
  return Number.isFinite(value) ? `${(value / 1000).toFixed(1)}s` : "n/a";
}

export default function App() {
  const [chatText, setChatText] = useState("");
  const [activeTab, setActiveTab] = useState("summary");
  const [taskStatuses, setTaskStatuses] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [outcomeFilter, setOutcomeFilter] = useState("All");
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
  const [useLocalModel, setUseLocalModel] = useState(false);
  const [sourceSnapshot, setSourceSnapshot] = useState(null);
  const [dateOrderChoice, setDateOrderChoice] = useState("auto");
  const [legacyCacheStatus, setLegacyCacheStatus] = useState({ type: "", message: "" });
  const fileInputRef = useRef(null);
  const chatTextareaRef = useRef(null);
  const activeRunRef = useRef(0);
  const legacyCleanupAttemptedRef = useRef(false);

  useEffect(() => {
    if (legacyCleanupAttemptedRef.current) return;
    legacyCleanupAttemptedRef.current = true;
    const cleanup = clearLegacySessionCache();
    if (!cleanup.success) {
      setLegacyCacheStatus({
        type: "error",
        message: `The old session cache could not be confirmed as removed: ${cleanup.error}. Conversation analysis now uses memory-only caching; review this tab's site storage manually if needed.`,
      });
    } else if (cleanup.removed) {
      setLegacyCacheStatus({ type: "success", message: "The legacy conversation-result cache entry was removed from this tab." });
    }
  }, []);

  const runtimeSupport = checkLocalModelSupport();
  const taskStatusCounts = countTaskStatuses(analysis.actions, taskStatuses);
  const completedCount = taskStatusCounts.completed;
  const possibleCount = analysis.actions.filter((task) => task.outcome === "possible").length;
  const priorityView = buildPriorityView(analysis);
  const highAlerts = priorityView.counts.High;
  const missedMentions = analysis.mentions.length;
  const lineCount = analysis.lineCount;

  const analyticsMeters = [
    {
      id: "urgent-lines",
      label: "High-urgency rows",
      count: analysis.urgentRows.length,
      total: lineCount,
      percent: toPercent(analysis.urgentRows.length, lineCount),
      description: "Rows flagged by local AI and rule checks",
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
      description: "Task candidates from local AI and rule checks",
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
      description: "Rows with possible dates or time references",
      fillClass: "bg-amber-300",
      glowClass: "shadow-[0_0_15px_rgba(252,211,77,0.35)]",
      icon: CalendarClock,
      toneClass: "bg-amber-300/10 text-amber-200",
    },
  ];

  const filteredActions = analysis.actions.filter((task) => {
    const matchesSearch = task.text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUrgency = urgencyFilter === "All" || task.urgency === urgencyFilter;
    const matchesStatus = statusFilter === "All" || getTaskStatus(taskStatuses, task.id) === statusFilter;
    const matchesOutcome = outcomeFilter === "All" || (task.outcome || "confirmed") === outcomeFilter;
    return matchesSearch && matchesUrgency && matchesStatus && matchesOutcome;
  });

  function resetAnalysis() {
    // Invalidate async work before clearing data so late completions cannot repopulate the cache.
    activeRunRef.current += 1;
    invalidateAnalysisWork();
    setSourceSnapshot(null);
    setAnalysis(createEmptyAnalysis());
    setHasAnalysis(false);
    setTaskStatuses({});
    setUseLocalModel(false);
    setActiveTab("summary");
    setSearchQuery("");
    setUrgencyFilter("All");
    setStatusFilter("All");
    setOutcomeFilter("All");
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
        setFileStatus({ type: "success", message: `Loaded ${file.name} locally. Choose an analysis mode when ready.` });
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

  async function runAnalysis(options = {}) {
    const forceFresh = options?.forceFresh === true;
    const source = chatText;
    if (!source.trim()) {
      setAnalysisStatus({ type: "error", message: "Paste or upload a chat log before running analysis." });
      return;
    }
    if (source.length > MAX_ANALYSIS_CHARACTERS) {
      setAnalysisStatus({ type: "error", message: `This log is too large for a safe interactive run (${source.length.toLocaleString()} characters). Split it into smaller files or keep it under ${MAX_ANALYSIS_CHARACTERS.toLocaleString()} characters.` });
      return;
    }

    const runId = ++activeRunRef.current;
    const startedAt = Date.now();
    const modelWasReady = modelState.state === "ready";
    let usedCachedResult = false;

    setIsAnalyzing(true);
    setHasAnalysis(false);
    setAnalysis(createEmptyAnalysis());
    setSourceSnapshot(null);
    setAnalysisStatus({ type: "progress", message: "Preserving source text and validating local processing support…" });

    try {
      const requestedOrder = options?.dateOrder ?? dateOrderChoice;
      const snapshot = await createSourceSnapshot(source, { dateOrder: requestedOrder === "auto" ? undefined : requestedOrder });
      if (runId !== activeRunRef.current) return;
      setSourceSnapshot(snapshot);

      const selectedMode = useLocalModel ? "local-model" : "rules-only";
      setAnalysisStatus({
        type: "progress",
        message: selectedMode === "local-model"
          ? "Checking WebGPU before loading the on-device model…"
          : "Running deterministic rules-only analysis; the model runtime will not be loaded…",
      });

      const execution = await analyzeTextByMode(source, selectedMode, (event) => {
        if (runId !== activeRunRef.current) return;
        if (event.cached) usedCachedResult = true;
        if (event.stage === "model") {
          const progress = typeof event.progress === "number" ? Math.round(event.progress * 100) : 0;
          setModelState({ state: "loading", progress: Math.max(0, Math.min(100, progress)), message: event.message || "Downloading and initializing local model" });
          setAnalysisStatus({ type: "progress", message: event.message || "Preparing local AI model" });
        } else {
          setModelState((current) => ({ ...current, state: "ready", progress: 100, message: "Local model ready" }));
          setAnalysisStatus({ type: "progress", message: event.message || "Analyzing conversation locally" });
        }
      }, { forceFresh, sourceSnapshot: snapshot });

      if (runId !== activeRunRef.current) return;
      const result = execution.analysis;
      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      const inferenceCompleted = result.modelExecution?.status === "completed";
      const segmentCount = inferenceCompleted && Number.isFinite(result.sourceChunks) ? result.sourceChunks : 0;
      setAnalysis(result);
      setHasAnalysis(true);
      setTaskStatuses({});

      if (execution.mode === "rules-only" && execution.fallbackReason) {
        setModelState({ state: "rules-only", progress: 0, message: "Rules-only fallback active" });
      } else if (inferenceCompleted) {
        setModelState({ state: "ready", progress: 100, message: "Local model inference completed" });
      }

      const granularityNote = (snapshot.boundaryMode === "opaque"
        ? " Source boundaries were not recognizable; this import is represented as one source message with unknown author/time."
        : ` ${snapshot.messages.length} source messages recognized.`) + describeImportWarnings(snapshot);
      const inferenceNote = execution.fallbackReason
        ? `WebGPU unavailable; rules-only fallback completed (${execution.fallbackReason})`
        : execution.mode === "rules-only"
          ? "Rules-only analysis completed; WebLLM was not loaded"
          : usedCachedResult
            ? "Cached result reused; Qwen inference completed on the original run"
            : `Qwen inference completed · ${result.modelExecution.structuredResponsesValidated} structured response${result.modelExecution.structuredResponsesValidated === 1 ? "" : "s"} validated`;
      const statusType = execution.fallbackReason
        ? "warning"
        : execution.mode === "local-model" && inferenceCompleted && !(snapshot.importWarnings || []).some((w) => w.severity === "error")
          ? "success"
          : "";
      const modelSegmentNote = execution.mode === "local-model"
        ? ` · ${segmentCount} model segment${segmentCount === 1 ? "" : "s"}`
        : "";
      const diagnostics = result.diagnostics;
      const timingNote = execution.mode !== "local-model" || !diagnostics
        ? ""
        : diagnostics.engineReused
          ? ` · engine reused; inference ${formatDurationMs(diagnostics.inferenceMs)}`
          : ` · import ${formatDurationMs(diagnostics.runtimeImportMs)}; init ${formatDurationMs(diagnostics.modelInitializationMs)}; inference ${formatDurationMs(diagnostics.inferenceMs)}`;
      setAnalysisStatus({
        type: statusType,
        message: `${inferenceNote}${modelSegmentNote}${timingNote} · ${elapsedSeconds}s.${granularityNote}`,
      });
      setActiveTab("summary");
    } catch (error) {
      if (runId !== activeRunRef.current) return;
      if (useLocalModel && !modelWasReady) {
        setModelState((current) => ({ ...current, state: "error", message: "Local model unavailable" }));
      }
      setAnalysisStatus({ type: "error", message: error instanceof Error ? error.message : "Local analysis failed. Check WebGPU support and try again." });
    } finally {
      if (runId === activeRunRef.current) setIsAnalyzing(false);
    }
  }

  function changeTaskStatus(id, nextStatus) {
    setTaskStatuses((current) => updateTaskStatus(current, id, nextStatus));
  }

  function showSourceInInput(reference) {
    if (!reference || reference.snapshotId !== sourceSnapshot?.snapshotId || !Number.isSafeInteger(reference.startOffset) || !Number.isSafeInteger(reference.endOffset)) {
      setAnalysisStatus({ type: "warning", message: "This source reference is unavailable or belongs to an older chat snapshot." });
      return;
    }
    const textarea = chatTextareaRef.current;
    if (!textarea) return;
    textarea.scrollIntoView({ behavior: "smooth", block: "center" });
    textarea.focus();
    textarea.setSelectionRange(reference.startOffset, reference.endOffset);
  }

  function downloadExecutiveBrief() {
    setExportStatus({ type: "", message: "" });
    if (!chatText.trim() || !hasAnalysis) {
      setExportStatus({ type: "error", message: "Run an analysis before exporting the brief." });
      return;
    }

    const markdown = buildExecutiveBrief({ analysis, taskStatuses, loadedFileName });

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
    const content = buildCopySummary({ analysis, taskStatuses });

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
    { id: "summary", label: "Catch-up summary", icon: Sparkles, count: analysis.summary.length },
    { id: "tasks", label: "Action items", icon: ClipboardList, count: analysis.actions.length },
    { id: "matrix", label: "Priority view", icon: Target, count: priorityView.uniquePriorityCount },
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
            <Badge tone={modelState.state === "ready" ? "green" : modelState.state === "error" ? "red" : modelState.state === "rules-only" ? "amber" : "blue"}><Cpu size={14} aria-hidden="true" /> {modelState.state === "ready" ? "Local model ready" : modelState.state === "loading" ? "Loading model" : modelState.state === "error" ? "Model needs attention" : modelState.state === "rules-only" ? "Rules-only fallback active" : "Local model not loaded"}</Badge>
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
                  <div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone={runtimeSupport.supported ? "green" : "red"}>{runtimeSupport.supported ? "WebGPU API present" : "Rules-only fallback available"}</Badge><Badge tone="slate">No chat API</Badge></div>
                </div>
              </div>
              {modelState.state === "loading" && <div className="mt-4"><div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-400"><span>{modelState.message}</span><span className="tabular-nums">{modelState.progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400 transition-[width] duration-300" style={{ width: `${modelState.progress}%` }} /></div></div>}
              <label htmlFor="use-local-model" className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-cyan-300/20 bg-slate-950/45 p-3.5">
                <input id="use-local-model" type="checkbox" checked={useLocalModel} disabled={isAnalyzing} onChange={(event) => setUseLocalModel(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950" />
                <span><span className="block text-sm font-semibold text-slate-100">Enable on-device AI for this analysis</span><span className="mt-1 block text-xs leading-5 text-slate-400">Off by default. Checking this box only enables the model path; the runtime and model weights are not loaded until you click Analyze. First use downloads Qwen weights into browser-managed cache. Requires compatible WebGPU hardware.</span></span>
              </label>
              <p className="mt-3 text-xs leading-5 text-slate-400">When unchecked, analysis uses deterministic local patterns only and does not load the WebLLM runtime. In either mode, conversation text is processed in the browser and is not sent to a cloud AI endpoint.</p>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
            <div className="rounded-2xl border border-slate-700/50 bg-slate-900/45 p-4 shadow-[0_18px_55px_rgba(2,6,23,0.26)] backdrop-blur-xl sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-400/10 text-indigo-200 ring-1 ring-indigo-300/20"><MessageSquareText size={17} aria-hidden="true" /></div><h2 className="font-bold text-white">Conversation input</h2></div><p className="mt-2 text-sm leading-6 text-slate-400">Paste raw chat text or import a local text log. No sample conversations are preloaded.</p><p className="mt-2 text-xs leading-5 text-cyan-200/80">WhatsApp workflow: export a chat without media, then upload the exported .txt file here. Only analyze conversations you are authorized to use.</p><p className="mt-2 text-xs leading-5 text-slate-500">Raw conversation text, source snapshots, excerpts, and findings remain memory-only. Up to three analysis results may be cached in memory until cleared or the page is closed. Unstructured text is treated as one source message when message headers cannot be recognized.</p></div>
                <Badge tone="green"><LockKeyhole size={12} /> Local</Badge>
              </div>
              <div onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }} onDrop={handleDrop} className={cx("mb-4 rounded-xl border-2 border-dashed p-4 transition-colors", isDragging ? "border-cyan-300 bg-cyan-300/10 ring-4 ring-cyan-300/10" : "border-slate-700 bg-slate-950/45 hover:border-cyan-300/50 hover:bg-slate-950/65")} role="region" aria-label="Local chat log file upload">
                <input ref={fileInputRef} type="file" accept=".txt,.log,text/plain" className="sr-only" aria-label="Choose a local .txt or .log chat file" disabled={isAnalyzing} onChange={(event) => { handleLocalFile(event.target.files?.[0]); event.target.value = ""; }} />
                <div className="flex flex-col items-center justify-center gap-2 text-center sm:flex-row sm:text-left"><span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", isDragging ? "bg-cyan-300 text-slate-950" : "bg-slate-900 text-cyan-200 ring-1 ring-slate-700")}><Upload size={21} aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-200">Drop a .txt or .log file here</p><p className="mt-1 text-xs leading-5 text-slate-400">Read locally in the browser · 5 MB file limit</p>{loadedFileName && <p className="mt-1 truncate text-xs font-semibold text-emerald-300">Loaded: {loadedFileName}</p>}</div><button type="button" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"><FileText size={14} aria-hidden="true" /> Browse files</button></div>
                {fileStatus.message && <p className={cx("mt-3 rounded-lg px-3 py-2 text-xs leading-5", fileStatus.type === "error" ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200")} role={fileStatus.type === "error" ? "alert" : "status"} aria-live="polite">{fileStatus.message}</p>}
              </div>
              <label htmlFor="chat-log" className="mb-2 block text-sm font-semibold text-slate-200">Chat log</label>
              <textarea ref={chatTextareaRef} id="chat-log" value={chatText} disabled={isAnalyzing} onChange={(event) => handleTextChange(event.target.value)} placeholder="Paste or drop a raw conversation here…" rows={15} spellCheck="false" className="w-full resize-y rounded-xl border border-slate-700/70 bg-slate-950/75 px-4 py-3 font-mono text-xs leading-6 text-slate-100 shadow-inner shadow-black/20 placeholder:font-sans placeholder:text-slate-500 focus:border-cyan-300/70 focus:bg-slate-950 focus:outline-none focus:ring-4 focus:ring-indigo-400/20" />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400"><span>{chatText.length.toLocaleString()} characters · {chatText.split(/\r?\n/).filter((line) => line.trim()).length} non-empty rows</span><button type="button" onClick={() => { handleTextChange(""); setLoadedFileName(""); setFileStatus({ type: "", message: "" }); }} disabled={!chatText || isAnalyzing} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-slate-400 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><X size={13} /> Clear input</button></div>
              <button type="button" onClick={runAnalysis} disabled={!chatText.trim() || isAnalyzing} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200/20 bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500 px-4 py-3 text-sm font-extrabold text-white shadow-[0_0_30px_rgba(99,102,241,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_38px_rgba(34,211,238,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0">
                {isAnalyzing ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
                {isAnalyzing ? "Analyzing locally…" : useLocalModel ? (modelState.state === "ready" ? "Analyze with on-device AI" : "Load model & analyze") : "Run rules-only analysis"}
              </button>
              {hasAnalysis && !isAnalyzing && <button type="button" onClick={() => runAnalysis({ forceFresh: true })} disabled={!chatText.trim()} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-xs font-bold text-slate-200 transition-colors hover:border-cyan-300/50 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-45">Run fresh analysis (skip cache)</button>}
              {analysisStatus.message && <p className={cx("mt-3 rounded-lg px-3 py-2.5 text-xs leading-5", analysisStatus.type === "error" ? "bg-rose-400/10 text-rose-200" : analysisStatus.type === "success" ? "bg-emerald-400/10 text-emerald-200" : analysisStatus.type === "warning" ? "bg-amber-300/10 text-amber-100" : "bg-cyan-300/10 text-cyan-100")} role={analysisStatus.type === "error" ? "alert" : "status"} aria-live="polite">{analysisStatus.message}</p>}
              <ImportReview warnings={sourceSnapshot?.importWarnings} dateOrderChoice={dateOrderChoice} disabled={isAnalyzing} onDateOrderChange={(value) => { setDateOrderChoice(value); runAnalysis({ forceFresh: true, dateOrder: value }); }} />
              {legacyCacheStatus.message && <p className={cx("mt-2 rounded-lg px-3 py-2 text-xs leading-5", legacyCacheStatus.type === "error" ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200")} role={legacyCacheStatus.type === "error" ? "alert" : "status"}>{legacyCacheStatus.message}</p>}
              {hasAnalysis && sourceSnapshot && <p className="mt-2 rounded-lg border border-slate-700/60 bg-slate-950/35 px-3 py-2 text-xs leading-5 text-slate-400">Source snapshot: {sourceSnapshot.messages.length} {sourceSnapshot.messages.length === 1 ? "message" : "messages"} · {sourceSnapshot.boundaryMode === "opaque" ? "Opaque import; reduced message-level granularity; author and timestamp unknown" : "Recognized source records; original order preserved"}.</p>}
              <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3.5"><div className="flex items-start gap-2.5"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" /><div><p className="text-xs font-bold text-emerald-200">Privacy model</p><p className="mt-1 text-xs leading-5 text-emerald-100/75">Rules-only analysis is the default and does not load WebLLM. Only after you enable on-device AI and run an analysis does the app check WebGPU and, if compatible, download/cache model weights and run inference on this device. If adapter/device setup fails, the app falls back to local rules. Conversation contents are not posted to a cloud AI endpoint.</p></div></div></div>
            </div>

            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><MetricCard icon={Bell} label="Priority items" value={hasAnalysis ? priorityView.uniquePriorityCount : "—"} caption={hasAnalysis ? `${analysis.actions.length} task candidates · ${priorityView.standaloneSignalCount} standalone signals · ${highAlerts} high` : "Run local analysis to calculate"} tone="rose" /><MetricCard icon={ClipboardList} label="Extracted tasks" value={hasAnalysis ? analysis.actions.length : "—"} caption={hasAnalysis ? `${taskStatusCounts["needs-review"]} need review · ${completedCount} completed` : "Generated from your chat"} tone="blue" /><MetricCard icon={Hash} label="Mentions" value={hasAnalysis ? missedMentions : "—"} caption="Direct handles identified locally" tone="violet" /></div>

              <section className="rounded-2xl border border-slate-700/50 bg-slate-900/45 p-4 shadow-[0_18px_55px_rgba(2,6,23,0.26)] backdrop-blur-xl sm:p-5" aria-labelledby="operational-index-heading">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-indigo-300">Live metrics</p><h2 id="operational-index-heading" className="text-lg font-bold tracking-tight text-white">Operational Index Analytics</h2><p className="mt-1 text-xs leading-5 text-slate-400">Metrics reflect the current local analysis; rules-only fallback coverage is limited.</p></div><button type="button" onClick={downloadExecutiveBrief} disabled={!hasAnalysis} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-indigo-300/30 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-[0_0_28px_rgba(99,102,241,0.24)] transition-all hover:-translate-y-0.5 hover:from-indigo-400 hover:via-violet-400 hover:to-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"><Download size={15} aria-hidden="true" /> Download Local Executive Brief (.md)</button></div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">{analyticsMeters.map((meter) => <ProgressMeter key={meter.id} meter={meter} />)}</div>
                {exportStatus.message && <p className={cx("mt-4 rounded-lg px-3 py-2 text-xs leading-5", exportStatus.type === "error" ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200")} role={exportStatus.type === "error" ? "alert" : "status"} aria-live="polite">{exportStatus.message}</p>}
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/45 shadow-[0_18px_55px_rgba(2,6,23,0.26)] backdrop-blur-xl">
                <div className="border-b border-slate-700/50 px-4 pt-4 sm:px-5"><SectionHeading eyebrow="Your catch-up brief" title="Signal over noise" description="Summary items are derived from deterministic local checks. Exact source-reference validity is tracked separately from whether an interpretation is correct." action={<button type="button" onClick={copySummary} disabled={!hasAnalysis} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-300/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy brief"}</button>} />
                  <div className="mt-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Analysis views">{tabs.map((tab) => { const Icon = tab.icon; const selected = activeTab === tab.id; return <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={cx("inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300 sm:px-4", selected ? "border-cyan-300 text-cyan-100" : "border-transparent text-slate-400 hover:border-slate-500 hover:text-slate-200")}><Icon size={15} aria-hidden="true" />{tab.label}<span className={cx("rounded-md px-1.5 py-0.5 text-[11px]", selected ? "bg-cyan-300/10 text-cyan-100" : "bg-slate-800 text-slate-400")}>{hasAnalysis ? tab.count : "—"}</span></button>; })}</div>
                </div>
                <div className="p-4 sm:p-5">
                  {activeTab === "summary" && <div id="panel-summary" role="tabpanel" aria-labelledby="tab-summary" className="space-y-4">{!hasAnalysis ? <EmptyState icon={Sparkles} title="Your catch-up brief will appear here" description="Paste or upload a conversation and run rules-only extraction by default. You can explicitly opt in to the on-device model when you want additional candidate suggestions." /> : <><div className="rounded-2xl border border-indigo-300/20 bg-gradient-to-br from-indigo-500/[0.13] via-slate-900/70 to-cyan-400/[0.06] p-5 shadow-[0_18px_46px_rgba(2,6,23,0.24)]"><div className="mb-3 flex flex-wrap items-center gap-2 text-cyan-100"><Sparkles size={17} aria-hidden="true" /><h3 className="text-sm font-bold">Deterministic catch-up summary</h3><Badge tone="blue">{analysis.modelId || MODEL_ID}</Badge>{analysis.modelExecution?.status === "completed" ? <Badge tone="green">Qwen inference completed · {analysis.modelExecution.structuredResponsesValidated} validated response{analysis.modelExecution.structuredResponsesValidated === 1 ? "" : "s"}</Badge> : <Badge tone="amber">Rules-only · Qwen not run</Badge>}</div><p className="mb-3 text-xs leading-5 text-slate-400">This summary is built from deterministic source checks. When shown above, Qwen's structured findings were also generated locally and merged into the review candidates; source-reference validation remains a separate check.</p><ul className="space-y-3">{analysis.summary.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2.5 text-sm leading-6 text-slate-200"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" /><span>{item}</span></li>)}</ul>{analysis.summary.length === 0 && <p className="text-sm text-slate-400">No locally extracted summary items were found.</p>}{analysis.summaryEvidence?.length > 0 && <p className="mt-3 border-t border-slate-700/50 pt-3 text-xs leading-5 text-slate-400">{analysis.summaryEvidence.length} finding references point to exact source spans. This validates reference integrity only; semantic support remains unverified.</p>}</div>
                    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-slate-700/70 bg-slate-900/45 p-4 shadow-[0_12px_32px_rgba(2,6,23,0.18)]"><div className="mb-2 flex items-center gap-2 text-slate-200"><CalendarClock size={16} className="text-indigo-300" /><p className="text-xs font-bold">Deadlines and timing</p></div>{analysis.deadlines.length ? <ul className="space-y-3">{analysis.deadlines.slice(0, 6).map((item) => <li key={item.id} className="text-xs leading-5 text-slate-300"><Badge tone={urgencyTone(item.urgency)}>{item.dates.join(", ") || "Time reference"}</Badge><p className="mt-1.5">{item.text}</p><p className="mt-1 text-[11px] text-slate-500">{item.sourceReferenceStatus === "valid" ? "Source reference valid · interpretation unverified" : "Unverified · no exact source reference"}</p></li>)}</ul> : <p className="text-xs leading-5 text-slate-500">No deadline signals returned.</p>}</div>
                      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/45 p-4 shadow-[0_12px_32px_rgba(2,6,23,0.18)]"><div className="mb-2 flex items-center gap-2 text-slate-200"><Users size={16} className="text-violet-300" /><p className="text-xs font-bold">Direct mentions</p></div>{analysis.mentions.length ? <ul className="space-y-2">{analysis.mentions.slice(0, 8).map((item, index) => <li key={`${item.handle}-${index}`} className="text-xs leading-5 text-slate-300"><span className="font-bold text-violet-200">@{item.handle}</span><p className="mt-0.5">{item.line}</p><p className="mt-0.5 text-[11px] text-slate-500">{item.sourceReferenceStatus === "valid" ? "Source reference valid · interpretation unverified" : "Unverified · no exact source reference"}</p></li>)}</ul> : <p className="text-xs leading-5 text-slate-500">No direct mentions returned.</p>}</div></div>
                    <p className="flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-100/90"><AlertCircle size={15} className="mt-0.5 shrink-0" />AI output can contain errors. Verify important dates, owners, decisions, and urgency classifications against the original conversation.</p></>}</div>}

                  {activeTab === "tasks" && <div id="panel-tasks" role="tabpanel" aria-labelledby="tab-tasks" className="space-y-4">{!hasAnalysis ? <EmptyState icon={ClipboardList} title="No analyzed tasks" description="Run an analysis to extract and track candidate action items." /> : <><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" /><label htmlFor="task-search" className="sr-only">Search action items</label><input id="task-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search extracted tasks…" className="w-full rounded-lg border border-slate-700 bg-slate-950/50 py-2.5 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/60 focus:outline-none focus:ring-4 focus:ring-indigo-400/15" /></div><div className="relative"><Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" /><label htmlFor="urgency-filter" className="sr-only">Filter by urgency</label><select id="urgency-filter" value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value)} className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950/70 py-2.5 pl-9 pr-8 text-xs font-semibold text-slate-200 focus:border-cyan-300/60 focus:outline-none focus:ring-4 focus:ring-indigo-400/15"><option value="All">All urgencies</option><option>High</option><option>Medium</option><option>Low</option></select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" /></div><div className="relative"><label htmlFor="status-filter" className="sr-only">Filter by review status</label><select id="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2.5 pr-8 text-xs font-semibold text-slate-200 focus:border-cyan-300/60 focus:outline-none focus:ring-4 focus:ring-indigo-400/15"><option value="All">All statuses</option>{TASK_STATUSES.map((status) => <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" /></div><OutcomeFilter value={outcomeFilter} onChange={setOutcomeFilter} /></div>
                    {analysis.actions.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{TASK_STATUSES.map((status) => <div key={status} className="rounded-xl border border-slate-700/70 bg-slate-900/50 px-3 py-3 shadow-[0_8px_22px_rgba(2,6,23,0.16)]"><p className="text-lg font-bold tabular-nums text-white">{taskStatusCounts[status]}</p><p className="text-[11px] leading-4 text-slate-400">{TASK_STATUS_LABELS[status]}</p></div>)}</div>}
                    {possibleCount > 0 && <p className="rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2 text-xs leading-5 text-amber-100" role="note">{possibleCount} of {analysis.actions.length} task{analysis.actions.length === 1 ? " is" : "s are"} marked <strong>Possible · review</strong>: the wording suggests a task but the evidence is weaker (an implied request, no named deliverable, or a suggestion). Confirm or reject each one.</p>}
                    {filteredActions.length ? <div className="space-y-2">{filteredActions.map((task) => { const status = getTaskStatus(taskStatuses, task.id); return <TaskCard key={task.id} task={task} status={status} onShowSource={showSourceInInput} onChangeStatus={changeTaskStatus} />; })}</div> : <EmptyState icon={ClipboardList} title={analysis.actions.length ? "No matching tasks" : "No action items returned"} description={analysis.actions.length ? "Try a different query or urgency level." : "The local model did not identify action items in this log."} />}
                    <ReviewQueue items={analysis.reviewQueue || []} onShowSource={showSourceInInput} />
                    {analysis.actions.length > 0 && <p className="text-xs text-slate-400">{taskStatusCounts["needs-review"]} need review · {taskStatusCounts.confirmed} confirmed · {taskStatusCounts["in-progress"]} in progress · {completedCount} completed · {taskStatusCounts.rejected} rejected. Review changes last for this page session.</p>}</>}</div>}

                  {activeTab === "matrix" && <div id="panel-matrix" role="tabpanel" aria-labelledby="tab-matrix" className="space-y-4">{!hasAnalysis ? <EmptyState icon={Target} title="Priority view is waiting" description="Run local analysis to identify candidate tasks and their supporting signals." /> : <>
                    <div className="rounded-2xl border border-slate-700/70 bg-slate-900/45 p-4 shadow-[0_12px_32px_rgba(2,6,23,0.18)]"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-slate-100">Unique priority items</p><Badge tone="blue">{priorityView.uniquePriorityCount} counted once</Badge></div><p className="mt-1 text-xs leading-5 text-slate-400">Action candidates are the primary items. A deadline or urgency marker from the same recognized source message is attached as context, not counted as another alert.</p><div className="mt-3 grid grid-cols-3 gap-2">{[{ name: "High", count: priorityView.counts.High, tone: "red", icon: ArrowUpRight, note: "Review first" }, { name: "Medium", count: priorityView.counts.Medium, tone: "amber", icon: Activity, note: "Plan next" }, { name: "Low", count: priorityView.counts.Low, tone: "slate", icon: ArrowDownRight, note: "Keep in view" }].map((group) => { const Icon = group.icon; return <div key={group.name} className={cx("rounded-2xl border p-4 shadow-[0_10px_26px_rgba(2,6,23,0.18)] transition-all duration-200 hover:-translate-y-0.5", group.tone === "red" ? "border-rose-300/20 bg-rose-400/[0.06]" : group.tone === "amber" ? "border-amber-300/20 bg-amber-300/[0.05]" : "border-slate-700/60 bg-slate-950/35")}><div className="flex items-center justify-between gap-1"><p className={cx("text-xs font-bold", group.tone === "red" ? "text-rose-200" : group.tone === "amber" ? "text-amber-200" : "text-slate-300")}>{group.name}</p><Icon size={14} aria-hidden="true" /></div><p className="mt-2 text-2xl font-extrabold tabular-nums text-white">{group.count}</p><p className="mt-1 text-[11px] text-slate-400">{group.note}</p></div>; })}</div></div>
                    {priorityView.priorityItems.length ? <div className="space-y-4">{["High", "Medium", "Low"].map((level) => { const items = priorityView.priorityItems.filter((item) => item.urgency === level); if (!items.length) return null; return <section key={level}><div className="mb-2 flex items-center gap-2"><span className={cx("h-2 w-2 rounded-full", level === "High" ? "bg-rose-400" : level === "Medium" ? "bg-amber-300" : "bg-slate-400")} /><h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{level} priority</h3><span className="text-xs text-slate-500">{items.length}</span></div><div className="space-y-2">{items.map((item) => <PriorityItem key={item.id} item={item} />)}</div></section>; })}</div> : <EmptyState icon={Target} title="No priority items returned" description="No action candidates or standalone urgency signals were detected." />}
                    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-xs leading-5 text-slate-400">{priorityView.uniqueTaskCount} task candidates · {priorityView.linkedSignalCount} supporting signals attached to task messages · {priorityView.standaloneSignalCount} standalone source signal groups. Supporting signals are not added again to the priority count.</div>
                  </>}</div>}
                </div>
              </section>
            </div>
          </section>

          <footer className="mt-8 flex flex-col gap-3 border-t border-slate-700/50 pt-5 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between"><p className="inline-flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-300" /> Chat analysis runs in the browser · No chat API calls</p><p>Unread Radar AI · WebGPU inference when available · Rules-only fallback otherwise</p></footer>
        </main>
      </div>
    </div>
  );
}
