"use client";
// Extra feature: "After the call" update.
// The salesperson pastes what happened on the call; the AI re-scores the lead and updates the plan.
import { useState } from "react";
import type { Lead } from "@/lib/types";
import { api } from "@/lib/client";

export default function CallLogger({ lead, onChange }: { lead: Lead; onChange: (lead: Lead) => void }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logCall() {
    if (!notes.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      // the server re-scores the lead, saves the call in the database and returns the updated lead
      onChange(await api<Lead>("POST", `/leads/${lead.id}/calls`, { notes }));
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900">📞 After the call: update this lead</h3>
      <p className="mb-3 text-xs text-slate-600">
        Paste your call notes or the call transcript. AI re-scores the lead and rewrites the next action, the Sales Action Plan and the reply.
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. Spoke for 10 min. Wife liked the floor plan but wants a park-facing unit. Asked for 5% discount. Visit booked Sunday 11am."
        className="min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={logCall}
        disabled={busy || !notes.trim()}
        className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
      >
        {busy ? "Updating lead..." : "Log call & re-score"}
      </button>

      {lead.calls.length > 0 && (
        <ul className="mt-4 space-y-2">
          {lead.calls.map((c) => {
            const diff = c.newScore - c.previousScore;
            return (
              <li key={c.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">{new Date(c.date).toLocaleString()}</span>
                  <span className={`text-xs font-bold ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-slate-500"}`}>
                    Score {c.previousScore} → {c.newScore} ({diff > 0 ? "+" : ""}
                    {diff})
                  </span>
                </div>
                <p className="mt-1 text-slate-800">{c.outcome}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
