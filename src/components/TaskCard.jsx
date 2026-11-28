import { cx, urgencyTone } from "../lib/ui/format.js";
import { OutcomeBadge as ExtractorOutcomeBadge } from "./OutcomeBadge.jsx";
import { Badge } from "./ui/Badge.jsx";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "../lib/views/taskWorkflow.js";
import { hasGroundedOwner } from "../lib/views/catchUpBrief.js";
import { TaskWhyPanel } from "./TaskWhyPanel.jsx";

function OutcomeBadge({ task, status }) {
  if (task.outcome === "possible"
    && (task.humanReviewStatus === "promoted" || ["confirmed", "in-progress", "completed", "rejected"].includes(status))) {
    return <Badge tone="amber" title={task.extractionOutcomeReason || task.outcomeReason || "The extractor classified this as possible."}>Extractor: possible</Badge>;
  }
  return <ExtractorOutcomeBadge task={task} />;
}

function classificationLabel(task) {
  if (task.classification === "self_commitment") return `Self-commitment · ${task.owner || "speaker"}`;
  if (task.classification === "collective_task") return "Team task · no owner stated";
  if (task.classification === "unassigned_request") return "Unassigned request · no owner stated";
  if (task.classification === "unassigned_action") return "Unassigned action · no owner stated";
  if (task.classification === "user_confirmed_candidate") return "Candidate confirmed by you · no owner assigned";
  if (task.classification === "model_candidate") return "Model suggestion · verify details";
  if (hasGroundedOwner(task)) return `Assigned task · ${task.owner}`;
  if (task.owner) return "Owner basis unclear · not assigned to a participant";
  return "Unclassified candidate · verify owner";
}

function conditionLabel(task) {
  if (task.conditionStatus === "reported_satisfied") return `Condition reported satisfied: ${task.condition}`;
  if (task.conditionStatus === "reported_rejected") return `Condition reported rejected: ${task.condition}`;
  if (task.conditionStatus === "ambiguous") return `Condition status ambiguous: ${task.condition}`;
  return `Condition pending verification: ${task.condition}`;
}

function supportLabel(kind) {
  const labels = {
    "precondition-context": "Original condition",
    "condition-resolution:reported_satisfied": "Condition satisfaction evidence",
    "condition-resolution:reported_rejected": "Condition rejection evidence",
    "condition-resolution:ambiguous": "Conflicting condition evidence",
    "condition-resolution:pending_verification": "Condition status evidence",
    "condition-resolution:superseded:reported_satisfied": "Earlier approval (superseded)",
    "condition-resolution:superseded:reported_rejected": "Earlier rejection (superseded)",
  };
  return labels[kind] || kind || "Related message";
}

function TaskCardContent({ task: sourceTask, status, onShowSource, onChangeStatus }) {
  const humanReviewed = sourceTask.humanReviewStatus === "promoted"
    || ["confirmed", "in-progress", "completed", "rejected"].includes(status);
  const task = sourceTask.humanReviewStatus === "promoted"
    ? { ...sourceTask, outcomeReason: null }
    : sourceTask;

  return (
    <article className={cx(
      "group rounded-2xl border p-4 shadow-[0_14px_36px_rgba(2,6,23,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(2,6,23,0.26)]",
      status === "completed" ? "border-emerald-300/20 bg-emerald-400/[0.05]"
        : status === "rejected" ? "border-rose-300/20 bg-rose-400/[0.04]"
          : "border-slate-700/60 bg-slate-950/30 hover:border-indigo-300/30 hover:bg-slate-950/55",
    )}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          {task.sourceEvidence?.quote ? (
            <button
              type="button"
              onClick={() => onShowSource?.(task.sourceEvidence, task.sourceReferenceStatus)}
              className={cx(
                "block w-full rounded text-left text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                status === "completed" || status === "rejected" ? "text-slate-400" : "text-slate-100",
              )}
            >
              {task.text}
            </button>
          ) : (
            <p className={cx("text-sm leading-6", status === "completed" || status === "rejected" ? "text-slate-400" : "text-slate-100")}>
              {task.text}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={urgencyTone(task.urgency)}>{task.urgency} priority</Badge>
            <OutcomeBadge task={task} status={status} />
            {task.humanReviewStatus === "promoted" && <Badge tone="green">Promoted by you</Badge>}
            <span className="text-xs text-slate-400">{classificationLabel(task)}</span>
            {task.suggestedOwner && <span className="text-xs text-amber-200">Suggested owner (unverified): {task.suggestedOwner}</span>}
            {task.suggestedDueDate && <span className="text-xs text-amber-200">Suggested timing (unverified): {task.suggestedDueDate}</span>}
            {task.acknowledgedBy && <span className="text-xs font-semibold text-emerald-300">Acknowledged by {task.acknowledgedBy}</span>}
            {task.dueDate && (
              <span className={cx(
                "text-xs",
                task.dueDateStatus === "contextual" ? "text-amber-200"
                  : task.dueDateStatus === "explicit" ? "text-cyan-200" : "text-slate-400",
              )}>
                {task.dueDateStatus === "contextual" ? `Contextual timing · verify: ${task.dueDate}`
                  : task.dueDateStatus === "explicit" ? `Explicit deadline: ${task.dueDate}`
                    : `Unverified due signal: ${task.dueDate}`}
              </span>
            )}
            {task.condition && (
              <span className={cx(
                "text-xs",
                task.conditionStatus === "reported_satisfied" ? "text-emerald-200"
                  : task.conditionStatus === "reported_rejected" ? "text-rose-200"
                    : task.conditionStatus === "ambiguous" ? "text-orange-200" : "text-amber-200",
              )}>
                {conditionLabel(task)}
              </span>
            )}
            {typeof task.confidence === "number" && <span className="text-xs text-slate-500">Model confidence {Math.round(task.confidence * 100)}%</span>}
          </div>

          {task.outcome === "possible" && task.outcomeReason && task.classification !== "model_candidate" && (
            <p className="mt-2 text-xs leading-5 text-amber-200/90">
              Extractor note: {task.outcomeReason}{humanReviewed ? "" : ". Review this candidate before relying on it."}
            </p>
          )}
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {task.humanReviewStatus === "promoted"
              ? task.sourceReferenceStatus === "valid"
                ? "Exact source reference validated · candidate accepted for tracking by you"
                : "Candidate accepted for tracking by you · source reference remains unverified"
              : status === "confirmed"
                ? task.sourceReferenceStatus === "valid"
                  ? "Exact source reference validated · task meaning confirmed by you"
                  : "Task meaning confirmed by you · source reference remains unverified"
                : status === "in-progress"
                  ? `Marked in progress by you · ${task.sourceReferenceStatus === "valid" ? "source reference validated" : "source reference unverified"}`
                  : status === "completed" || status === "rejected"
                    ? `${TASK_STATUS_LABELS[status]} · extraction outcome and conversation lifecycle remain separate`
              : task.sourceReferenceStatus === "valid"
                ? "Exact source reference validated · meaning still needs human review"
                : "No verified source reference · treat this as an unverified candidate"}
          </p>

          {task.sourceEvidence?.quote ? (
            <div className="mt-2 rounded-xl border border-l-2 border-cyan-300/30 border-l-cyan-300/60 bg-slate-950/65 px-3 py-3 shadow-inner shadow-slate-950/30">
              <blockquote className="text-xs leading-5 text-slate-300">{task.sourceEvidence.quote}</blockquote>
              <button
                type="button"
                onClick={() => onShowSource?.(task.sourceEvidence, task.sourceReferenceStatus)}
                className="mt-2 text-[11px] font-bold text-cyan-200 underline decoration-cyan-200/40 underline-offset-2 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                Show original in chat
              </button>
              {task.acknowledgementEvidence?.quote && (
                <div className="mt-2 border-t border-emerald-300/15 pt-2">
                  <p className="text-[11px] text-emerald-200">Acknowledgement: {task.acknowledgementEvidence.quote}</p>
                  <button
                    type="button"
                    onClick={() => onShowSource?.(task.acknowledgementEvidence, task.acknowledgementReferenceStatus)}
                    className="mt-1 text-[11px] font-bold text-emerald-200 underline decoration-emerald-200/40 underline-offset-2 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                  >
                    Show acknowledgement in chat
                  </button>
                </div>
              )}
            </div>
          ) : task.evidence ? (
            <p className="mt-2 text-xs leading-5 text-slate-500">Model excerpt (unverified): {task.evidence}</p>
          ) : null}

          {task.supportingEvidence?.length > 0 && (
            <div className="mt-2 space-y-2 rounded-xl border border-violet-300/20 bg-violet-300/[0.045] px-3 py-3 shadow-inner shadow-slate-950/20">
              <p className="text-[11px] font-bold uppercase tracking-wider text-violet-200">Related conversation context</p>
              {task.supportingEvidence.map((detail, index) => (
                <div key={`${task.id}-support-${index}`} className="border-t border-violet-300/10 pt-2 first:border-0 first:pt-0">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-violet-200">{supportLabel(detail.kind)}</p>
                  <blockquote className="text-xs leading-5 text-slate-300">{detail.evidence?.quote || detail.text}</blockquote>
                  {detail.evidence?.quote && detail.sourceReferenceStatus === "valid" && (
                    <button
                      type="button"
                      onClick={() => onShowSource?.(detail.evidence, detail.sourceReferenceStatus)}
                      className="mt-1 text-[11px] font-bold text-violet-200 underline decoration-violet-200/40 underline-offset-2 hover:text-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                    >
                      Show related message in chat
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="w-full shrink-0 sm:w-40">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor={`task-status-${task.id}`}>
            Review status
          </label>
          <select
            id={`task-status-${task.id}`}
            value={status}
            onChange={(event) => onChangeStatus(task.id, event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-2 text-xs font-semibold text-slate-200 focus:border-cyan-300/60 focus:outline-none focus:ring-2 focus:ring-cyan-300/15"
          >
            {TASK_STATUSES.map((item) => <option key={item} value={item}>{TASK_STATUS_LABELS[item]}</option>)}
          </select>
        </div>
      </div>
    </article>
  );
}

export function TaskCard(props) {
  return (
    <div className="space-y-2">
      <TaskCardContent {...props} />
      <TaskWhyPanel task={props.task} reviewStatus={props.status} onShowSource={props.onShowSource} initiallyExpanded={props.whyInitiallyExpanded} />
    </div>
  );
}
