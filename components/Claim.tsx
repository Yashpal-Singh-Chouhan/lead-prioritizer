"use client";
// Claiming ("opting in to") a lead: one salesperson works each lead, so customers never get two calls.
// ClaimStatus = a small label, ClaimButton = a compact button for lists, ClaimBar = the banner on a lead's page.
import { useState } from "react";
import type { Lead } from "@/lib/types";
import { useSession } from "@/lib/auth";
import { useLeads } from "@/lib/leads-context";

export function useMyId() {
  return useSession().session?.user.id ?? "";
}

export function ClaimStatus({ lead }: { lead: Lead }) {
  const me = useMyId();
  if (!lead.claimedBy) {
    return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Open</span>;
  }
  if (lead.claimedBy.id === me) {
    return <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">✓ Yours</span>;
  }
  return (
    <span
      title={`Claimed by ${lead.claimedBy.name}`}
      className="truncate rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
    >
      🔒 {lead.claimedBy.name}
    </span>
  );
}

// For list rows: "Claim" on open leads, otherwise just the status
export function ClaimButton({ lead }: { lead: Lead }) {
  const { claimLead } = useLeads();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (lead.claimedBy) return <ClaimStatus lead={lead} />;
  return (
    <div className="min-w-0">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError((await claimLead(lead.id)) ?? "");
          setBusy(false);
        }}
        className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {busy ? "Claiming..." : "Claim"}
      </button>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

// The banner at the top of a lead's page: who is working this lead, and the button to claim or release it
export function ClaimBar({ lead }: { lead: Lead }) {
  const me = useMyId();
  const { claimLead, releaseLead } = useLeads();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mine = lead.claimedBy?.id === me;

  async function act(action: (id: string) => Promise<string | null>) {
    setBusy(true);
    setError((await action(lead.id)) ?? "");
    setBusy(false);
  }

  const since = lead.claimedAt ? new Date(lead.claimedAt).toLocaleString() : "";
  const tone = !lead.claimedBy ? "border-emerald-300 bg-emerald-50" : mine ? "border-indigo-200 bg-indigo-50" : "border-slate-300 bg-slate-100";

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {!lead.claimedBy && (
            <>
              <p className="font-semibold text-emerald-900">This lead is open</p>
              <p className="text-emerald-800/80">Claim it to call the customer, chat with AI and log calls. Your team will see it&apos;s yours.</p>
            </>
          )}
          {mine && (
            <>
              <p className="font-semibold text-indigo-900">✓ You&apos;re working this lead</p>
              <p className="text-indigo-800/80">Claimed {since}. Teammates see it as taken. Release it if someone else should take over.</p>
            </>
          )}
          {lead.claimedBy && !mine && (
            <>
              <p className="font-semibold text-slate-900">🔒 {lead.claimedBy.name} is working this lead</p>
              <p className="text-slate-600">Claimed {since}. You can read the analysis, but only they can act on it.</p>
            </>
          )}
        </div>
        {!lead.claimedBy && (
          <button
            type="button"
            onClick={() => act(claimLead)}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Claiming..." : "Claim this lead"}
          </button>
        )}
        {mine && (
          <button
            type="button"
            onClick={() => act(releaseLead)}
            disabled={busy}
            className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
          >
            {busy ? "Releasing..." : "Release to team"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
      <p className="mt-2 text-xs text-slate-500">Added by {lead.addedBy.id === me ? "you" : lead.addedBy.name}</p>
    </div>
  );
}
