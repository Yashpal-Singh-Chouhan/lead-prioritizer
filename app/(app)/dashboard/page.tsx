"use client";
// /dashboard: the first screen. Every lead in one scannable table, so the salesperson knows who needs
// attention within seconds. Filtering, sorting and searching happen in the database (GET /leads).
// Pipeline numbers come from GET /stats, which the backend also calculates with SQL.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Lead, Priority, SortKey, Stats } from "@/lib/types";
import { api, PRIORITY_STYLES } from "@/lib/client";
import { useLeads } from "@/lib/leads-context";

const PAGE_SIZE = 25;
const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Highest score first" },
  { key: "urgent", label: "Most urgent timeline" },
  { key: "newest", label: "Newest first" },
];

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

// Horizontal bars: one row per label, bar width = share of the biggest value
function HBars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="mb-1 flex justify-between text-slate-600">
            <span>{r.label}</span>
            <span className="font-semibold text-slate-900">{r.count}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div className="h-2.5 rounded-full bg-indigo-500" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Vertical columns, e.g. leads per day or per score range
function Columns({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex h-40 items-end gap-2">
      {rows.map((r) => (
        <div key={r.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="text-xs font-semibold text-slate-700">{r.count || ""}</span>
          <div className="w-full rounded-t-md bg-indigo-500" style={{ height: `${(r.count / max) * 100}%`, minHeight: r.count ? 4 : 0 }} />
          <span className="text-[10px] text-slate-500">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

// One scannable row: priority + score, who, money & timing, what they want, what to do
function LeadRow({ lead }: { lead: Lead }) {
  const a = lead.analysis;
  const style = PRIORITY_STYLES[a.priority];
  return (
    <Link
      href={`/leads/${lead.id}`}
      className="grid gap-3 border-b border-slate-100 px-4 py-3 transition last:border-0 hover:bg-indigo-50/40 lg:grid-cols-[92px_minmax(150px,1fr)_minmax(130px,0.8fr)_minmax(220px,1.7fr)_minmax(220px,1.5fr)] lg:items-center"
    >
      <div className="flex items-center gap-2 lg:flex-col lg:items-start lg:gap-1">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${style.badge}`}>{style.label}</span>
        <span className="text-lg font-extrabold leading-none text-slate-900">
          {a.score}
          <span className="text-xs font-medium text-slate-400">/100</span>
        </span>
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-900">{lead.name}</div>
        <div className="truncate text-xs text-slate-500">📍 {lead.location || "No location"}</div>
        <div className="truncate text-xs text-slate-500">🏠 {lead.requirement || "No requirement"}</div>
      </div>
      <div className="text-xs text-slate-700">
        <div>💰 {lead.budget || "Not given"}</div>
        <div className="mt-0.5">⏱ {lead.timeline || "Not given"}</div>
      </div>
      <p className="line-clamp-2 text-xs text-slate-600">{a.summary}</p>
      <div className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-900">
        <p className="line-clamp-2">➜ {a.nextAction}</p>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { loadDemo, busy: demoBusy, error: demoError } = useLeads();
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [sort, setSort] = useState<SortKey>("score");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // search text, applied after the user stops typing

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRows = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), sort });
      if (priority) params.set("priority", priority);
      if (query) params.set("q", query);
      api<{ items: Lead[]; total: number }>("GET", `/leads?${params}`)
        .then((page) => {
          setRows((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
          setTotal(page.total);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    },
    [priority, sort, query]
  );

  const fetchStats = useCallback(() => {
    api<Stats>("GET", "/stats")
      .then(setStats)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => fetchRows(0), [fetchRows]);
  useEffect(fetchStats, [fetchStats]);

  async function handleLoadDemo() {
    await loadDemo();
    fetchStats();
    fetchRows(0);
  }

  const chips: { key: Priority | ""; label: string; count: number | undefined; active: string }[] = [
    { key: "", label: "All leads", count: stats?.total, active: "border-slate-900 bg-slate-900 text-white" },
    { key: "Hot", label: PRIORITY_STYLES.Hot.label, count: stats?.byPriority.Hot, active: "border-red-500 bg-red-500 text-white" },
    { key: "Warm", label: PRIORITY_STYLES.Warm.label, count: stats?.byPriority.Warm, active: "border-amber-500 bg-amber-500 text-white" },
    { key: "Cold", label: PRIORITY_STYLES.Cold.label, count: stats?.byPriority.Cold, active: "border-sky-500 bg-sky-500 text-white" },
  ];
  const empty = stats?.total === 0;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Lead dashboard</h1>
          <p className="text-sm text-slate-500">Every lead is scored by AI. Work from the top of the list down.</p>
        </div>
        <Link href="/leads/new" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          + New lead
        </Link>
      </div>

      {(error || demoError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || demoError}</div>
      )}

      {empty ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          <p className="text-base font-semibold text-slate-900">No leads yet</p>
          <p className="mt-1">Add your first lead, or load realistic demo leads to see the AI in action.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/leads/new" className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700">
              Add a lead
            </Link>
            <button
              type="button"
              onClick={handleLoadDemo}
              disabled={demoBusy}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {demoBusy ? "AI is analyzing demo leads..." : "Load demo leads"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Priority chips double as the filter: one click shows only the hot leads */}
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => setPriority(c.key)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                  priority === c.key ? c.active : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                {c.label} <span className="ml-1 opacity-80">{c.count ?? "–"}</span>
              </button>
            ))}
            <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={80}
                placeholder="Search name, location, property..."
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none sm:w-64"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort leads"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="hidden border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[92px_minmax(150px,1fr)_minmax(130px,0.8fr)_minmax(220px,1.7fr)_minmax(220px,1.5fr)] lg:gap-3">
              <span>Priority</span>
              <span>Customer</span>
              <span>Budget · Timeline</span>
              <span>AI summary</span>
              <span>Recommended next action</span>
            </div>
            {rows.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
            {!loading && rows.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No leads match these filters.</p>
            )}
            {loading && rows.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Loading leads... (a sleeping server can take up to a minute to wake)</p>
            )}
          </div>
          {rows.length < total && (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetchRows(rows.length);
              }}
              disabled={loading}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Loading..." : `Load more (${total - rows.length} left)`}
            </button>
          )}

          {stats && stats.total > 0 && (
            <section className="space-y-4 pt-2">
              <h2 className="text-sm font-semibold text-slate-900">Pipeline insights</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average score</div>
                  <div className="mt-1 text-3xl font-extrabold text-slate-900">{stats.avgScore}</div>
                  <div className="mt-1 text-xs text-slate-500">out of 100</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hot share</div>
                  <div className="mt-1 text-3xl font-extrabold text-slate-900">{Math.round((stats.byPriority.Hot / stats.total) * 100)}%</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {stats.byPriority.Hot} of {stats.total} leads
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calls logged</div>
                  <div className="mt-1 text-3xl font-extrabold text-slate-900">{stats.calls.count}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {stats.calls.count
                      ? `Avg score change after a call: ${stats.calls.avgScoreChange > 0 ? "+" : ""}${stats.calls.avgScoreChange}`
                      : "Log calls from a lead's page"}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="Score distribution">
                  <Columns rows={stats.scoreBuckets} />
                </Panel>
                <Panel title="When do they plan to buy?">
                  <HBars rows={stats.byTimeline.filter((t) => t.label !== "Not specified" || t.count > 0)} />
                </Panel>
                <Panel title="New leads, last 14 days">
                  <Columns rows={stats.perDay.map((d) => ({ label: d.date.slice(8), count: d.count }))} />
                </Panel>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
