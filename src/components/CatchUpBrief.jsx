import { useMemo } from "react";
import { Badge } from "./ui/Badge.jsx";
import { PAST_DUE_LABEL, buildCatchUpBrief, hasGroundedOwner, listSpeakers } from "../lib/views/catchUpBrief.js";

function Group({ title, hint, tasks, tone, onShowSource, pastDueIds, statuses }) {
  if (!tasks.length) return null;
  return (
    <section className="space-y-2" aria-label={title}>
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">{title} · {tasks.length}</h4>
        {hint && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{hint}</p>}
      </div>
      {tasks.map((task) => (
        <article key={task.id} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">
          <p className="text-sm leading-5 text-slate-100">{task.text}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Badge tone={tone}>{hasGroundedOwner(task) ? task.owner : "Owner not established"}</Badge>
            {task.outcome === "possible" && <Badge tone="amber">Extractor: possible</Badge>}
            {task.humanReviewStatus === "promoted"
              ? <Badge tone="green">Accepted for tracking by you</Badge>
              : statuses?.[task.id] === "confirmed"
                ? <Badge tone="green">Confirmed by you</Badge>
                : statuses?.[task.id] === "in-progress"
                  ? <Badge tone="blue">Marked in progress by you</Badge>
                  : null}
            {task.dueDate && <span>Due: {task.dueDate}{task.resolvedDueDate ? ` (${task.resolvedDueDate})` : ""}</span>}
            {pastDueIds.has(task.id) && <Badge tone="red">{PAST_DUE_LABEL}</Badge>}
            {(task.lifecycleStatus === "blocked" || task.lifecycleStatus === "delayed") && <Badge tone="amber">{task.lifecycleStatus}</Badge>}
          </div>
          {task.sourceEvidence?.quote && (
            <button type="button" onClick={() => onShowSource(task.sourceEvidence, task.sourceReferenceStatus)} className="mt-1.5 text-[11px] font-bold text-cyan-200 underline decoration-cyan-200/40 underline-offset-2 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
              Show original in chat
            </button>
          )}
        </article>
      ))}
    </section>
  );
}

/**
 * Groups tasks by ownership for a catch-up brief.
 * The reader identifies themselves; extraction remains unchanged.
 */
export function CatchUpBrief({ actions, snapshot, statuses, me, onChangeMe, asOf, onChangeAsOf, onShowSource }) {
  const speakers = useMemo(() => listSpeakers(snapshot), [snapshot]);
  const brief = useMemo(() => buildCatchUpBrief(actions, { me, asOf, statuses, speakers }), [actions, me, asOf, statuses, speakers]);
  const pastDueIds = useMemo(() => new Set(brief.pastDue.map((t) => t.id)), [brief]);
  const g = brief.groups;
  const empty = brief.counts.open === 0;

  return (
    <div className="space-y-4 rounded-2xl border border-indigo-300/20 bg-slate-900/50 p-4" id="catch-up-brief">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Who are you in this chat?
          <select value={me || ""} onChange={(e) => onChangeMe(e.target.value || null)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-2 text-xs font-semibold normal-case tracking-normal text-slate-200">
            <option value="">Not selected</option>
            {speakers.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          As of
          <input type="date" value={asOf || ""} onChange={(e) => onChangeAsOf(e.target.value || null)} className="mt-1 block rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-2 text-xs font-semibold normal-case tracking-normal text-slate-200" />
        </label>
      </div>
      {brief.needsIdentity && <p className="text-xs text-amber-200">Choose who you are to see what is assigned to you. Until then, no task is shown as yours.</p>}
      {brief.identityNotInChat && <p className="text-xs text-amber-200">The person you chose does not speak in this chat, so nothing is shown as yours.</p>}
      {asOf && !brief.asOfValid && <p className="text-xs text-amber-200">That date is not valid, so past-due checks are off.</p>}
      <p className="text-xs text-slate-400">{brief.counts.open} open · {brief.counts.done} closed · {brief.counts.pastDue} past due as of {brief.asOfValid ? asOf : "(no date)"}. Past due means a stated deadline has passed and no completion message was found in this chat. The work may have been completed outside this conversation.</p>
      {empty && <p className="text-xs text-slate-400">Nothing open to catch up on.</p>}
      <Group title="Assigned to you" tasks={g.assignedToYou} tone="blue" onShowSource={onShowSource} pastDueIds={pastDueIds} statuses={statuses} />
      <Group title="Might be you" hint="The owner name could match more than one person in this chat." tasks={g.mightBeYou} tone="amber" onShowSource={onShowSource} pastDueIds={pastDueIds} statuses={statuses} />
      <Group title="Assigned to others" tasks={g.assignedToOthers} tone="slate" onShowSource={onShowSource} pastDueIds={pastDueIds} statuses={statuses} />
      <Group title="Assigned" hint="Pick who you are above to split these into yours and others'." tasks={g.assigned} tone="slate" onShowSource={onShowSource} pastDueIds={pastDueIds} statuses={statuses} />
      <Group title="Owner not established" tasks={g.noOwner} tone="amber" onShowSource={onShowSource} pastDueIds={pastDueIds} statuses={statuses} />
      <Group title="Needs a human look" hint="Possible tasks. Not counted as assigned to anyone." tasks={g.needsReview} tone="amber" onShowSource={onShowSource} pastDueIds={pastDueIds} statuses={statuses} />
    </div>
  );
}
