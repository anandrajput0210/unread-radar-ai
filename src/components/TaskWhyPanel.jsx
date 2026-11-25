import { createContext, useContext, useId, useState } from "react";
import { buildTaskWhy } from "../lib/views/taskWhy.js";

export const TaskWhyDataContext = createContext({ messages: [], speakers: [] });

const OWNER_BASIS_LABELS = Object.freeze({
  "named-in-request": "Named in request",
  "claimed-by-speaker": "Claimed by speaker",
  "implied-addressee": "Implied addressee",
  unknown: "Unknown",
  ambiguous: "Ambiguous",
});

function messageReference(messages, messageIndex) {
  const message = messages[messageIndex];
  if (!message) return null;
  return {
    snapshotId: message.snapshotId,
    messageId: message.messageId,
    startOffset: message.startOffset,
    endOffset: message.endOffset,
  };
}

export function TaskWhyPanel({ task, messages, speakers, onShowSource }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const context = useContext(TaskWhyDataContext);
  const sourceMessages = messages ?? context.messages;
  const sourceSpeakers = speakers ?? context.speakers;
  const why = buildTaskWhy(task, { messages: sourceMessages, speakers: sourceSpeakers });

  return (
    <section className="rounded-xl border border-slate-700/50 bg-slate-950/25">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
        className="w-full rounded-xl px-4 py-3 text-left text-xs font-bold text-cyan-100 hover:bg-slate-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300"
      >
        Why this task?
      </button>
      <div id={panelId} hidden={!expanded} className="space-y-4 border-t border-slate-700/50 px-4 py-4">
        <section aria-label="Owner basis">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Owner basis · {OWNER_BASIS_LABELS[why.ownerBasis.status]}
          </h4>
          <p className="mt-1 text-xs leading-5 text-slate-200">{why.ownerBasis.reason}</p>
        </section>

        <section aria-label="Timing">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Timing</h4>
          <p className="mt-1 text-xs leading-5 text-slate-200">{why.timing.text}</p>
        </section>

        <section aria-label="Lifecycle timeline">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Conversation timeline</h4>
          {why.timeline.length ? (
            <ol className="mt-2 space-y-3 border-l border-slate-700 pl-4">
              {why.timeline.map((event, index) => {
                const reference = messageReference(sourceMessages, event.messageIndex);
                const canShowSource = event.referenceStatus === "valid" && reference && onShowSource;
                return (
                  <li key={`${event.type}-${event.messageIndex ?? "unknown"}-${index}`} className="relative">
                    <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-cyan-300" aria-hidden="true" />
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-200">
                      {event.type.replaceAll("-", " ")}
                      {event.speaker ? <span className="font-medium normal-case text-slate-400"> · {event.speaker}</span> : null}
                    </p>
                    <blockquote className="mt-1 text-xs leading-5 text-slate-300">{event.quote}</blockquote>
                    {canShowSource ? (
                      <button
                        type="button"
                        onClick={() => onShowSource(reference, event.referenceStatus)}
                        className="mt-1 text-[11px] font-bold text-cyan-200 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                      >
                        Show this message
                      </button>
                    ) : event.referenceStatus !== "valid" ? (
                      <p className="mt-1 text-[11px] text-amber-200">Source reference could not be verified</p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-1 text-xs text-slate-400">No source-backed timeline events are available.</p>
          )}
        </section>

        <section aria-label="Evidence">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Evidence</h4>
          {why.evidence.quote ? (
            <blockquote className="mt-1 border-l-2 border-cyan-300/50 pl-3 text-xs leading-5 text-slate-200">
              {why.evidence.quote}
            </blockquote>
          ) : (
            <p className="mt-1 text-xs text-slate-400">No exact source quote is available.</p>
          )}
          {why.evidence.referenceStatus === "valid" && why.evidence.messageIndex !== null && onShowSource ? (
            <button
              type="button"
              onClick={() => onShowSource(task.sourceEvidence, why.evidence.referenceStatus)}
              className="mt-2 text-[11px] font-bold text-cyan-200 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              Show evidence in conversation
            </button>
          ) : (
            <p className="mt-2 text-[11px] text-amber-200">Source reference could not be verified</p>
          )}
        </section>

        {why.caveats.length > 0 && (
          <ul aria-label="Caveats" className="space-y-1 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] p-3 text-xs leading-5 text-amber-100">
            {why.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
