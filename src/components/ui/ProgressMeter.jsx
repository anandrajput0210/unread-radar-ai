import { cx } from "../../lib/ui/format.js";

export function ProgressMeter({ meter }) {
  const Icon = meter.icon;
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meter.toneClass)}>
            <Icon size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-100">{meter.label}</p>
            <p className="mt-0.5 text-xs leading-4 text-slate-400">{meter.description}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold tabular-nums text-white">{meter.percent}%</p>
          <p className="text-[11px] text-slate-400">{meter.count} / {meter.total} rows</p>
        </div>
      </div>
      <div
        className="mt-4 h-2.5 overflow-hidden rounded-full border border-slate-700/60 bg-slate-950/80"
        role="progressbar"
        aria-label={meter.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={meter.percent}
        aria-valuetext={`${meter.percent}% of ${meter.total} non-empty rows`}
      >
        <div className={cx("h-full rounded-full transition-[width] duration-700 ease-out", meter.fillClass, meter.glowClass)} style={{ width: `${meter.percent}%` }} />
      </div>
    </div>
  );
}
