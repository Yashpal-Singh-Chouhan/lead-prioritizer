"use client";
// The left-hand list: every saved lead, grouped Hot / Warm / Cold and sorted by score.
import type { Lead, Priority } from "@/lib/types";
import { PRIORITY_STYLES, SAMPLE_LEADS } from "@/lib/client";

const GROUPS: Priority[] = ["Hot", "Warm", "Cold"];

export default function LeadList({
  leads,
  selectedId,
  onSelect,
  onLoadDemo,
  busy,
}: {
  leads: Lead[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLoadDemo: () => void;
  busy: boolean;
}) {
  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
        <p className="mb-3">No leads yet. Add one with the form, or load demo leads.</p>
        <button
          type="button"
          onClick={onLoadDemo}
          disabled={busy}
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
        >
          {busy ? "Analyzing demo leads..." : `Load ${SAMPLE_LEADS.length} demo leads`}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {GROUPS.map((group) => {
        const items = leads
          .filter((l) => l.analysis.priority === group)
          .sort((a, b) => b.analysis.score - a.analysis.score);
        if (items.length === 0) return null;
        return (
          <section key={group}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className={`h-2 w-2 rounded-full ${PRIORITY_STYLES[group].dot}`} />
              {group} · {items.length}
            </h3>
            <ul className="space-y-2">
              {items.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(lead.id)}
                    className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 ${
                      selectedId === lead.id ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-slate-900">{lead.name}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${PRIORITY_STYLES[group].badge}`}>
                        {lead.analysis.score}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{lead.analysis.intent}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {[lead.location, lead.budget, lead.timeline].filter(Boolean).join(" · ")}
                      {lead.calls.length > 0 && ` · ${lead.calls.length} call${lead.calls.length > 1 ? "s" : ""}`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
