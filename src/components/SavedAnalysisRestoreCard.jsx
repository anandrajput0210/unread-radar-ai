export function SavedAnalysisRestoreCard({
  session,
  replaceInput = false,
  isRestoring = false,
  isBusy = false,
  onRestore,
  onDismiss,
}) {
  const preview = session.sourceText.split(/\r?\n/u).find((line) => line.trim())?.trim() || "Empty conversation";
  const shortPreview = preview.length > 150 ? `${preview.slice(0, 147)}...` : preview;

  return (
    <article className="mb-4 rounded-xl border border-cyan-300/25 bg-cyan-300/[0.05] p-3" aria-label="Saved analysis available">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-cyan-100">Saved analysis available</h3>
          <p className="mt-1 text-xs text-slate-400">Saved {new Date(session.savedAt).toLocaleString()}</p>
          <p className="mt-2 break-words text-xs leading-5 text-slate-200">{shortPreview}</p>
          {replaceInput && <p className="mt-2 text-xs leading-5 text-amber-100">Restoring replaces the current input and analysis.</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onRestore(session.fingerprint)}
            disabled={isBusy}
            className="rounded-lg border border-cyan-200/30 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:border-cyan-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-wait disabled:opacity-50"
          >
            {isRestoring ? "Restoring…" : replaceInput ? "Replace input and restore" : "Restore saved analysis"}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(session.fingerprint)}
            disabled={isBusy}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            Dismiss
          </button>
        </div>
      </div>
    </article>
  );
}
