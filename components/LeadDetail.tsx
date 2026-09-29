"use client";
// The right-hand panel: one lead's AI analysis, laid out to be scanned in seconds.
import { useState } from "react";
import type { Lead } from "@/lib/types";
import { PRIORITY_STYLES } from "@/lib/client";
import LeadChat from "./LeadChat";
import CallLogger from "./CallLogger";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

export default function LeadDetail({
  lead,
  onChange,
  onDelete,
}: {
  lead: Lead;
  onChange: (lead: Lead) => void;
  onDelete: (id: string) => void;
}) {
  const a = lead.analysis;
  const style = PRIORITY_STYLES[a.priority];
  const [copied, setCopied] = useState(false);

  async function copyReply() {
    await navigator.clipboard.writeText(a.suggestedResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      {/* Header: who, and how hot */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{lead.name}</h2>
            <p className="text-sm text-slate-500">
              {[lead.location, lead.requirement, lead.budget, lead.timeline].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className={`rounded-xl border px-3 py-2 text-center ${style.badge}`}>
            <div className="text-2xl font-extrabold leading-none">{a.score}</div>
            <div className="text-xs font-semibold">{style.label}</div>
          </div>
        </div>
        {a.scoreReason && <p className="mt-2 text-xs text-slate-500">Why: {a.scoreReason}</p>}

        {/* The single most important thing: what to do next */}
        <div className="mt-4 rounded-xl bg-indigo-600 p-4 text-white">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Next action</div>
          <div className="mt-1 font-semibold">{a.nextAction}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Summary">{a.summary}</Card>
        <Card title="Intent">{a.intent}</Card>
        <Card title="Key requirements">
          {a.keyRequirements.length ? (
            <div className="flex flex-wrap gap-2">
              {a.keyRequirements.map((r) => (
                <span key={r} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{r}</span>
              ))}
            </div>
          ) : (
            <span className="text-slate-400">None identified</span>
          )}
        </Card>
        <Card title="Objections / concerns">
          {a.objections.length ? (
            <ul className="list-disc space-y-1 pl-4">
              {a.objections.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          ) : (
            <span className="text-slate-400">None raised</span>
          )}
        </Card>
      </div>

      <Card title="Suggested response to customer">
        <p className="whitespace-pre-wrap">{a.suggestedResponse}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copyReply} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(a.suggestedResponse)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            Send on WhatsApp
          </a>
        </div>
      </Card>

      <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">Original customer message</summary>
        <p className="mt-2 whitespace-pre-wrap text-slate-700">{lead.message}</p>
      </details>

      <CallLogger lead={lead} onChange={onChange} />
      <LeadChat lead={lead} onChange={onChange} />

      <button
        type="button"
        onClick={() => confirm(`Delete ${lead.name}?`) && onDelete(lead.id)}
        className="text-xs text-red-600 hover:underline"
      >
        Delete this lead
      </button>
    </div>
  );
}
