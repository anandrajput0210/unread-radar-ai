import { Badge } from "./ui/Badge.jsx";

/**
 * Messages that look like they might carry a request or commitment but did not meet
 * the bar for a task. They are NOT tasks: shown separately so a human can decide.
 */
export function ReviewQueue({ items = [], decisions = {}, onShowSource, onPromote, onReject }) {
  const activeItems = items.filter((item) => !decisions[item.id]);
  const decisionEntries = items
    .map((item) => ({ item, decision: decisions[item.id] }))
    .filter((entry) => entry.decision);
  if (!activeItems.length && !decisionEntries.length) return null;
  return (
    <section className="space-y-2" aria-labelledby="review-queue-heading" id="review-queue">
      <div>
        <h3 id="review-queue-heading" className="text-xs font-bold uppercase tracking-wider text-amber-200">
          Needs a human look · {activeItems.length}
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          Active items are unpromoted candidates and are not counted as tasks. Retained decisions are listed separately; promoted items are counted as tasks.
        </p>
      </div>
      {activeItems.map((item) => (
        <article key={item.id} className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone="amber">{item.extractionState === "insufficient_context" ? "Not enough context" : "Possible request"}</Badge>
            <span className="text-[11px] text-slate-400">{item.reasonLabel}</span>
            {item.missing?.length > 0 && <span className="text-[11px] text-slate-500">Missing: {item.missing.join(", ")}</span>}
          </div>
          <blockquote className="text-xs leading-5 text-slate-300">{item.sourceEvidence?.quote || item.text}</blockquote>
          {item.sourceEvidence?.quote && (
            <button type="button" onClick={() => onShowSource(item.sourceEvidence)} className="mt-1 text-[11px] font-bold text-cyan-200 underline decoration-cyan-200/40 underline-offset-2 hover:text-cyan-100">
              Show original in chat
            </button>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onPromote?.(item)} className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
              Promote to task
            </button>
            <button type="button" onClick={() => onReject?.(item)} className="rounded-lg border border-rose-300/30 bg-rose-400/10 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
              Reject
            </button>
          </div>
          {decisions[item.id]?.decision === "promoted" && (
            <p className="mt-2 text-xs font-semibold text-emerald-200">Promoted by you; retained as a human-confirmed task.</p>
          )}
          {decisions[item.id]?.decision === "rejected" && (
            <p className="mt-2 text-xs font-semibold text-rose-200">Rejected by you; removed from active review.</p>
          )}
        </article>
      ))}
      {decisionEntries.length > 0 && (
        <div className="space-y-1 rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Human review decisions retained this analysis</p>
          {decisionEntries.map(({ item, decision }) => (
            <p key={item.id} className={decision.decision === "promoted" ? "text-xs text-emerald-200" : "text-xs text-rose-200"}>
              {decision.decision === "promoted" ? "Promoted by you:" : "Rejected by you:"} {item.sourceEvidence?.quote || item.text}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
