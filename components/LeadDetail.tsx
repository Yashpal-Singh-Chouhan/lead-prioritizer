"use client";
// One lead's full picture: who they are, the AI analysis, the Sales Action Plan, the reply, chat and call log.
import { useState } from "react";
import type { Lead } from "@/lib/types";
import { PRIORITY_STYLES, whatsappNumber } from "@/lib/client";
import LeadChat from "./LeadChat";
import CallLogger from "./CallLogger";
import SalesActionPlan from "./SalesActionPlan";

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-36 shrink-0 text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value || <span className="font-normal text-slate-400">Not given</span>}</dd>
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
  const waNumber = whatsappNumber(lead.phone ?? "");
  const [copied, setCopied] = useState(false);

  async function copyReply() {
    await navigator.clipboard.writeText(a.suggestedResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      {/* Header: who, how hot, why, and what to do next */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{lead.name}</h2>
            <p className="text-sm text-slate-500">{a.intent}</p>
            {(lead.phone || lead.email) && (
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="rounded-lg border border-slate-300 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
                    📞 {lead.phone}
                  </a>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="rounded-lg border border-slate-300 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
                    ✉️ {lead.email}
                  </a>
                )}
              </div>
            )}
          </div>
          <div className={`rounded-xl border px-4 py-2 text-center ${style.badge}`}>
            <div className="text-3xl font-extrabold leading-none">{a.score}</div>
            <div className="mt-0.5 text-xs font-bold">{style.label}</div>
          </div>
        </div>

        {/* Transparent score: every point is explained */}
        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Why this priority</div>
          {a.scoreReason && <p className="text-sm text-slate-800">{a.scoreReason}</p>}
          {a.scoreBreakdown && a.scoreBreakdown.length > 0 && (
            <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {a.scoreBreakdown.map((s) => (
                <li key={s.key} className="text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span className="font-medium text-slate-700">{s.label}</span>
                    <span className="font-semibold text-slate-900">
                      {s.points}/{s.max}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-200">
                    <div className={`h-1.5 rounded-full ${style.dot}`} style={{ width: `${(s.points / s.max) * 100}%` }} />
                  </div>
                  {s.note && <div className="mt-0.5 text-slate-500">{s.note}</div>}
                </li>
              ))}
              {!!a.objectionPenalty && (
                <li className="text-xs text-red-700">
                  <div className="flex justify-between font-medium">
                    <span>Objection penalty</span>
                    <span className="font-semibold">−{a.objectionPenalty}</span>
                  </div>
                </li>
              )}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-slate-400">HOT ≥ 70 · WARM 40–69 · COLD &lt; 40</p>
        </div>

        {/* The single most important thing: what to do next */}
        <div className="mt-4 rounded-xl bg-indigo-600 p-4 text-white">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Recommended next action</div>
          <div className="mt-1 font-semibold">{a.nextAction}</div>
        </div>
      </div>

      <SalesActionPlan lead={lead} onChange={onChange} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Customer information">
          <dl className="divide-y divide-slate-100">
            <InfoRow label="Name" value={lead.name} />
            <InfoRow label="Location" value={lead.location} />
            <InfoRow label="Property requirement" value={lead.requirement} />
            <InfoRow label="Budget" value={lead.budget} />
            <InfoRow label="Buying timeline" value={lead.timeline} />
            <InfoRow label="Added" value={new Date(lead.createdAt).toLocaleString()} />
          </dl>
        </Card>
        <Card title="Customer message">
          <blockquote className="whitespace-pre-wrap border-l-4 border-slate-200 pl-3 italic text-slate-700">{lead.message}</blockquote>
        </Card>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">AI analysis</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Lead summary">{a.summary}</Card>
          <Card title="Customer intent">{a.intent}</Card>
          <Card title="Key requirements">
            {a.keyRequirements.length ? (
              <ul className="list-disc space-y-1 pl-4">
                {a.keyRequirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
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
              <span className="text-emerald-700">✓ No major objection identified.</span>
            )}
          </Card>
        </div>
      </div>

      <Card title="Suggested response to customer">
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3">{a.suggestedResponse}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copyReply} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
            {copied ? "Copied ✓" : "Copy Response"}
          </button>
          <a
            // with a phone number, WhatsApp opens that customer's chat directly; without one, you pick the contact
            href={`https://wa.me/${waNumber}?text=${encodeURIComponent(a.suggestedResponse)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
          >
            {waNumber ? "Send on WhatsApp" : "Share on WhatsApp"}
          </a>
        </div>
        <p className="mt-2 text-xs text-slate-400">Want it shorter, more assertive or in Hindi? Ask in the chat below.</p>
      </Card>

      <LeadChat lead={lead} onChange={onChange} />
      <CallLogger lead={lead} onChange={onChange} />

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
