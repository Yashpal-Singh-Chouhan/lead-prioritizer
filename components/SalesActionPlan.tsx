"use client";
// OUR OWN FEATURE: the Sales Action Plan.
// The analysis tells the salesperson WHAT the lead looks like; this tells them HOW to act on it:
// before the call (immediate action), during the call (questions + talking points), after it (follow-up).
import { useState } from "react";
import type { ActionPlan, Lead } from "@/lib/types";
import { api } from "@/lib/client";

function planAsText(name: string, plan: ActionPlan) {
  return [
    `SALES ACTION PLAN: ${name}`,
    "",
    "Immediate action",
    plan.immediateAction,
    "",
    "Questions to ask",
    ...plan.questionsToAsk.map((q, i) => `${i + 1}. ${q}`),
    "",
    "Call talking points",
    ...plan.talkingPoints.map((p) => `• ${p}`),
    "",
    "Follow-up",
    plan.followUp,
  ].join("\n");
}

function Step({ n, title, when, children }: { n: number; title: string; when: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/70 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{n}</span>
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{when}</span>
      </div>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

export default function SalesActionPlan({ lead, onChange }: { lead: Lead; onChange: (lead: Lead) => void }) {
  const plan = lead.analysis.actionPlan;
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      onChange(await api<Lead>("POST", `/leads/${lead.id}/analyze`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!plan) return;
    await navigator.clipboard.writeText(planAsText(lead.name, plan));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-emerald-900">🎯 Sales Action Plan</h3>
          <p className="text-xs text-emerald-800/80">How to act on this lead: before, during and after your conversation.</p>
        </div>
        {plan && (
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
          >
            {copied ? "Copied ✓" : "Copy plan"}
          </button>
        )}
      </div>

      {!plan ? (
        <div className="rounded-xl bg-white p-4 text-sm text-slate-700">
          <p>This lead was saved before action plans existed.</p>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Generating..." : "Generate Sales Action Plan"}
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Step n={1} title="Immediate action" when="Right now">
            <p className="font-medium">{plan.immediateAction}</p>
          </Step>
          <Step n={2} title="Questions to ask" when="On the call">
            {plan.questionsToAsk.length ? (
              <ol className="list-decimal space-y-1 pl-5">
                {plan.questionsToAsk.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            ) : (
              <p className="text-slate-400">No open questions.</p>
            )}
          </Step>
          <Step n={3} title="Call talking points" when="On the call">
            {plan.talkingPoints.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {plan.talkingPoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400">No talking points.</p>
            )}
          </Step>
          <Step n={4} title="Follow-up" when="After the call">
            <p>{plan.followUp || "Log the call below to get the next follow-up."}</p>
          </Step>
        </div>
      )}
    </section>
  );
}
