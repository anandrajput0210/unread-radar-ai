import { Badge } from "./ui/Badge.jsx";

/**
 * Messages that look like they might carry a request or commitment but did not meet
 * the bar for a task. They are NOT tasks: shown separately so a human can decide.
 */
export function ReviewQueue({ items = [], onShowSource }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2" aria-labelledby="review-queue-heading" id="review-queue">
      <div>
        <h3 id="review-queue-heading" className="text-xs font-bold uppercase tracking-wider text-amber-200">
          Needs a human look · {items.length}
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          These messages may contain a request or commitment, but not enough to call them tasks. Nothing here is counted as a task.
        </p>
      </div>
      {items.map((item) => (
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
        </article>
      ))}
    </section>
  );
}
