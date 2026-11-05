import { cx } from "../../lib/ui/format.js";

export function MetricCard({ icon: Icon, label, value, caption, tone = "blue" }) {
  const styles = {
    blue: "bg-cyan-400/10 text-cyan-200 ring-cyan-300/20 shadow-[0_0_28px_rgba(34,211,238,0.08)]",
    rose: "bg-rose-400/10 text-rose-200 ring-rose-300/20 shadow-[0_0_28px_rgba(244,63,94,0.08)]",
    violet: "bg-violet-400/10 text-violet-200 ring-violet-300/20 shadow-[0_0_28px_rgba(139,92,246,0.10)]",
  };
  return (
    <div className="group rounded-2xl border border-slate-700/50 bg-slate-900/40 p-4 shadow-[0_12px_40px_rgba(2,6,23,0.22)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:border-slate-600/80 hover:bg-slate-900/65 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white tabular-nums">{value}</p>
        </div>
        <div className={cx("rounded-xl p-2.5 ring-1 transition-transform duration-200 group-hover:scale-110", styles[tone])}>
          <Icon size={19} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{caption}</p>
    </div>
  );
}
