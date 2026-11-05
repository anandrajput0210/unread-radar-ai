import { ChevronDown } from "lucide-react";

export const OUTCOME_FILTERS = Object.freeze({ All: "All tasks", confirmed: "Confirmed only", possible: "Possible · review" });

export function OutcomeFilter({ value, onChange }) {
  return (
    <div className="relative">
      <label htmlFor="outcome-filter" className="sr-only">Filter by confidence</label>
      <select id="outcome-filter" value={value} onChange={(event) => onChange(event.target.value)} className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2.5 pr-8 text-xs font-semibold text-slate-200 focus:border-cyan-300/60 focus:outline-none focus:ring-4 focus:ring-indigo-400/15">
        {Object.entries(OUTCOME_FILTERS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
    </div>
  );
}
