"use client";
// The main workspace: the prioritized lead list stays on the left for every /leads page,
// and the right side shows whatever page you're on (nothing selected, new lead, or a lead).
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLeads } from "@/lib/leads-context";
import LeadList from "@/components/LeadList";

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  const { leads, total, loadingList, busy, error, loadMore, loadDemo } = useLeads();
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const hotCount = leads.filter((l) => l.analysis.priority === "Hot").length;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[320px_1fr]">
      <aside>
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {total} leads · {hotCount} hot on screen
          </p>
          <Link href="/leads/new" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
            + New lead
          </Link>
        </div>
        {loadingList && leads.length === 0 ? (
          <p className="text-sm text-slate-500">Loading leads... (a sleeping server can take up to a minute to wake)</p>
        ) : (
          <LeadList
            leads={leads}
            selectedId={params.id ?? null}
            onSelect={(id) => router.push(`/leads/${id}`)}
            onLoadDemo={loadDemo}
            busy={busy}
          />
        )}
        {leads.length < total && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingList}
            className="mt-4 w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingList ? "Loading..." : `Load more (${total - leads.length} left)`}
          </button>
        )}
      </aside>
      <section>
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {children}
      </section>
    </main>
  );
}
