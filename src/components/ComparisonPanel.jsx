import comparisonManifest from "../../docs/comparison/manifest.json";
import { hasGroundedOwner, ownerMatch } from "../lib/views/catchUpBrief.js";

function displayedOwner(task, speakers) {
  if (!task?.owner || task.ownerBasis === "ambiguous" || !hasGroundedOwner(task)) return null;
  const matches = speakers.filter((speaker) => ownerMatch(task.owner, speaker, speakers) === "yes");
  return matches.length === 1 ? task.owner : null;
}

function RulesOutput({ analysis, speakers }) {
  const findings = [
    ...(Array.isArray(analysis?.actions) ? analysis.actions : []),
    ...(Array.isArray(analysis?.reviewQueue) ? analysis.reviewQueue : []),
  ];

  if (!findings.length) return <p className="text-xs text-slate-400">No task findings in this local analysis.</p>;

  return (
    <ul className="space-y-3">
      {findings.map((task, index) => {
        const owner = displayedOwner(task, speakers);
        return (
          <li key={task.id || `finding-${index}`} className="rounded-lg border border-slate-700/50 bg-slate-950/30 p-3">
            <p className="text-sm leading-5 text-slate-200">{task.text}</p>
            <p className="mt-1 text-xs text-slate-400">
              {owner ? `Assigned: ${owner}` : task.outcome === "possible" ? "Possible finding · owner not established" : "Owner not established"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function ComparisonPanel({
  trapChatId,
  analysis,
  speakers = [],
  entries = comparisonManifest.entries,
}) {
  if (!trapChatId) return null;
  const selectedEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.trapChatId === trapChatId);

  if (!selectedEntries.length) {
    return (
      <section className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4" aria-label="Compare with a general-purpose AI">
        <p className="text-xs text-slate-400">No recorded comparison for this chat yet.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4" aria-label="Compare with a general-purpose AI">
      <h3 className="text-sm font-bold text-slate-100">Compare with a general-purpose AI</h3>
      {selectedEntries.map((entry, index) => (
        <article key={`${entry.trapChatId}-${entry.runDate}-${index}`} className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-950/25 p-3">
          <p className="text-xs leading-5 text-slate-300">
            One run on {entry.runDate} using {entry.toolName} {entry.modelName}. Results vary. This is not a benchmark.
          </p>
          <div>
            <h4 className="text-xs font-bold text-slate-200">Exact prompt used</h4>
            <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs leading-5 text-slate-300">{entry.exactPrompt}</pre>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <section className="min-w-0 space-y-2" aria-label="Unread Radar output">
              <h4 className="text-xs font-bold text-cyan-100">Unread Radar output</h4>
              <RulesOutput analysis={analysis} speakers={speakers} />
            </section>
            <section className="min-w-0 space-y-2" aria-label={`${entry.toolName} recorded output`}>
              <h4 className="text-xs font-bold text-slate-200">{entry.toolName} recorded output</h4>
              <pre className="whitespace-pre-wrap break-words rounded-lg border border-slate-700/50 bg-slate-950/30 p-3 font-sans text-xs leading-5 text-slate-200">{entry.outputText}</pre>
            </section>
          </div>
        </article>
      ))}
    </section>
  );
}
