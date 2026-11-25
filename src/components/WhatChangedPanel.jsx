function valueText(value) {
  if (value === null || value === undefined || value === "") return "Not established";
  if (typeof value === "object") {
    const parts = [
      value.dueDate,
      value.resolvedDueDate && `resolved to ${value.resolvedDueDate}`,
      value.status && `(${value.status})`,
    ]
      .filter(Boolean);
    return parts.join(" · ") || "Not established";
  }
  return String(value);
}

export function WhatChangedPanel({ diff }) {
  if (!diff) return null;

  const totalChanges = diff.newTasks.length
    + diff.resolvedTasks.length
    + diff.changedOwner.length
    + diff.changedDue.length;
  return (
    <details className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-3">
      <summary className="cursor-pointer rounded-md text-sm font-bold text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
        What changed since last time · {totalChanges} changes · {diff.unchanged} unchanged
      </summary>
      <div className="mt-3 space-y-3 text-xs leading-5 text-slate-300">
        <p>A source-message prefix matched; this may be the same conversation. Items are compared by exact evidence and message position; no tasks are merged.</p>
        {diff.newTasks.length > 0 && (
          <section>
            <h4 className="font-bold text-white">New tasks · {diff.newTasks.length}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {diff.newTasks.map((entry, index) => (
                <li key={`${entry.task.id}-${index}`}>
                  {entry.possiblySame ? "Possibly the same task: " : ""}{entry.task.text}
                </li>
              ))}
            </ul>
          </section>
        )}
        {diff.resolvedTasks.length > 0 && (
          <section>
            <h4 className="font-bold text-white">Resolved in the conversation · {diff.resolvedTasks.length}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {diff.resolvedTasks.map((entry, index) => (
                <li key={`${entry.task.id}-${index}`}>
                  {entry.lifecycleType === "cancelled" ? "Cancelled" : "Completed"}: {entry.task.text}
                  {entry.lifecycleQuote ? ` · “${entry.lifecycleQuote}”` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
        {diff.changedOwner.length > 0 && (
          <section>
            <h4 className="font-bold text-white">Owner changed · {diff.changedOwner.length}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {diff.changedOwner.map((entry, index) => (
                <li key={`${entry.task.id}-${index}`}>
                  {entry.task.text}: {valueText(entry.oldValue)} to {valueText(entry.newValue)}
                </li>
              ))}
            </ul>
          </section>
        )}
        {diff.changedDue.length > 0 && (
          <section>
            <h4 className="font-bold text-white">Timing changed · {diff.changedDue.length}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {diff.changedDue.map((entry, index) => (
                <li key={`${entry.task.id}-${index}`}>
                  {entry.task.text}: {valueText(entry.oldValue)} to {valueText(entry.newValue)}
                </li>
              ))}
            </ul>
          </section>
        )}
        {totalChanges === 0 && <p>No task changes were found in this comparison.</p>}
      </div>
    </details>
  );
}
