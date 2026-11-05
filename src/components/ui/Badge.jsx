import { cx } from "../../lib/ui/format.js";

export function Badge({ children, tone = "slate", className = "" }) {
  const tones = {
    slate: "border-slate-600/60 bg-slate-800/70 text-slate-300",
    green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    red: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    blue: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
    violet: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  };
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", tones[tone] || tones.slate, className)}>
      {children}
    </span>
  );
}
