"use client";
// /leads with nothing selected: a short guide pointing to the next step
import Link from "next/link";
import { useLeads } from "@/lib/leads-context";

export default function LeadsHome() {
  const { leads } = useLeads();
  const top = leads[0];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Pick a lead to work on</h2>
      <p className="mt-1 text-sm text-slate-500">Leads are sorted by AI score, so the top of the list is your next call.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {top && (
          <Link href={`/leads/${top.id}`} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Open top lead: {top.name}
          </Link>
        )}
        <Link href="/leads/new" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Add a new lead
        </Link>
      </div>
    </div>
  );
}
