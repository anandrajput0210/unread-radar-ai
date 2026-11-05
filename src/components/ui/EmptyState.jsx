import { FileText } from "lucide-react";

export function EmptyState({ icon: Icon = FileText, title, description }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/35 px-6 py-8 text-center">
      <div className="mb-3 rounded-xl bg-slate-900 p-3 text-slate-500 ring-1 ring-slate-700">
        <Icon size={22} aria-hidden="true" />
      </div>
      <p className="font-semibold text-slate-200">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}
