"use client";
// The main screen. It loads leads from our FastAPI backend (which stores them in PostgreSQL)
// and decides what to show: the list on the left, a form or a lead's details on the right.
import { useCallback, useEffect, useState } from "react";
import type { Lead, LeadInput } from "@/lib/types";
import { api, SAMPLE_LEADS } from "@/lib/client";
import LeadForm from "@/components/LeadForm";
import LeadList from "@/components/LeadList";
import LeadDetail from "@/components/LeadDetail";

const PAGE_SIZE = 20;
type Page = { items: Lead[]; total: number };

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null); // null = show the "new lead" form
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Loads one page of leads from the server (highest score first)
  const loadPage = useCallback((offset: number) => {
    api<Page>("GET", `/leads?limit=${PAGE_SIZE}&offset=${offset}`)
      .then((page) => {
        setLeads((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
        setTotal(page.total);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingList(false));
  }, []);

  // When the page opens, load the first page
  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  // Replace one lead in the list with its newest version (after chat, call, etc.)
  function upsert(lead: Lead) {
    setLeads((prev) => {
      const exists = prev.some((l) => l.id === lead.id);
      return exists ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev];
    });
  }

  async function addLead(input: LeadInput): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const lead = await api<Lead>("POST", "/leads", input);
      upsert(lead);
      setTotal((t) => t + 1);
      setSelectedId(lead.id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function loadDemo() {
    setBusy(true);
    setError("");
    try {
      for (const sample of SAMPLE_LEADS) {
        const lead = await api<Lead>("POST", "/leads", sample); // one at a time, to respect rate limits
        upsert(lead);
        setTotal((t) => t + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Opening a lead fetches its full details (including chat history) from the server
  async function selectLead(id: string) {
    setSelectedId(id);
    setError("");
    try {
      upsert(await api<Lead>("GET", `/leads/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function deleteLead(id: string) {
    try {
      await api<void>("DELETE", `/leads/${id}`);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  // Keep the list sorted by score, even after a call changes a lead's score
  const sorted = [...leads].sort((a, b) => b.analysis.score - a.analysis.score);
  const selected = leads.find((l) => l.id === selectedId) ?? null;
  const hotCount = leads.filter((l) => l.analysis.priority === "Hot").length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">Lead Prioritizer</h1>
            <p className="text-xs text-slate-500">
              {total} leads · {hotCount} hot on screen · AI-ranked so you call the right people first
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + New lead
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[320px_1fr]">
        <aside>
          {loadingList && leads.length === 0 ? (
            <p className="text-sm text-slate-500">Loading leads... (a sleeping server can take up to a minute to wake)</p>
          ) : (
            <LeadList leads={sorted} selectedId={selectedId} onSelect={selectLead} onLoadDemo={loadDemo} busy={busy} />
          )}
          {leads.length < total && (
            <button
              type="button"
              onClick={() => {
                setLoadingList(true);
                loadPage(leads.length);
              }}
              disabled={loadingList}
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingList ? "Loading..." : `Load more (${total - leads.length} left)`}
            </button>
          )}
        </aside>
        <section>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {selected ? (
            <LeadDetail key={selected.id} lead={selected} onChange={upsert} onDelete={deleteLead} />
          ) : (
            <LeadForm onSubmit={addLead} busy={busy} />
          )}
        </section>
      </main>
    </div>
  );
}
