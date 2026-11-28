import { useEffect, useRef } from "react";
import { resolveSourceMessageIndex } from "../lib/views/sourceSelection.js";

export function TaskSourcePane({ snapshot, selection }) {
  const selectedMessageRef = useRef(null);
  const reference = selection?.reference || null;
  const referenceStatus = selection?.referenceStatus || null;
  const selectedIndex = resolveSourceMessageIndex(snapshot, reference, referenceStatus);
  const hasSelection = selection !== null && selection !== undefined;
  const validSelection = referenceStatus === "valid" && selectedIndex !== null;
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];

  useEffect(() => {
    if (selectedIndex !== null) {
      selectedMessageRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }
  }, [selectedIndex, selection?.navigationId]);

  return (
    <aside className="min-w-0 self-start rounded-2xl border border-slate-700/60 bg-slate-950/45 p-3" aria-label="Conversation source">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-100">Conversation source</h3>
        <p className="mt-1 text-[11px] leading-4 text-slate-400">Messages are shown from the analyzed source snapshot.</p>
      </div>
      {hasSelection && selectedIndex === null ? (
        <p role="alert" className="rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2 text-xs leading-5 text-amber-100">
          Source reference could not be verified
        </p>
      ) : !hasSelection ? (
        <p className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2 text-xs leading-5 text-slate-400">
          Select a task or evidence quote to inspect its source message.
        </p>
      ) : null}
      {messages.length > 0 && (
        <ol className="max-h-[34rem] space-y-2 overflow-auto pr-1">
          {messages.map((message, index) => {
            const selected = index === selectedIndex;
            const dimmed = validSelection && !selected;
            return (
              <li
                key={message.messageId || `source-message-${index}`}
                ref={selected ? selectedMessageRef : null}
                aria-current={selected ? "true" : undefined}
                data-dimmed={dimmed ? "true" : undefined}
                className={selected
                  ? "rounded-xl border border-cyan-300/60 bg-cyan-300/[0.09] p-3 ring-2 ring-cyan-300/35"
                  : `rounded-xl border border-slate-700/50 bg-slate-900/40 p-3${dimmed ? " opacity-60 transition-opacity" : ""}`}
              >
                <p className="mb-1 text-[11px] font-semibold text-slate-400">
                  Message {index + 1}{message.authorRaw ? ` · ${message.authorRaw}` : ""}{message.timestampRaw ? ` · ${message.timestampRaw}` : ""}
                </p>
                <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-5 text-slate-200">{message.rawText}</pre>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
