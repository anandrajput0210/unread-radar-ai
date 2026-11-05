export function ImportReview({ warnings, dateOrderChoice, disabled, onDateOrderChange }) {
  if (!warnings?.length) return null;
  return (
        <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/5 px-3 py-2.5 text-xs leading-5 text-amber-100" role="group" aria-label="Import review">
          <p className="font-semibold">Import review</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {warnings.map((warning) => <li key={warning.code}>{warning.message}</li>)}
          </ul>
          {warnings.some((warning) => warning.code.startsWith("DATE_ORDER")) && (
            <label className="mt-2 flex flex-wrap items-center gap-2">
              <span>Date order in this chat:</span>
              <select
                className="rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
                value={dateOrderChoice}
                disabled={disabled}
                onChange={(event) => onDateOrderChange(event.target.value)}
              >
                <option value="auto">Auto-detect</option>
                <option value="dmy">Day / Month (DD/MM)</option>
                <option value="mdy">Month / Day (MM/DD)</option>
              </select>
            </label>
          )}
        </div>
  );
}
