"use client";
// Shared "memory" for the logged-in salesperson's leads.
// Every page inside the app (list, new lead, lead details) reads and updates the same state here,
// so moving between pages is instant and nothing is loaded twice.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Lead, LeadInput } from "./types";
import { api, ApiError, SAMPLE_LEADS } from "./client";

const PAGE_SIZE = 20;
type Page = { items: Lead[]; total: number };

type LeadsState = {
  leads: Lead[]; // sorted by score, highest first
  total: number;
  loadingList: boolean;
  busy: boolean;
  error: string;
  setError: (msg: string) => void;
  loadMore: () => void;
  upsert: (lead: Lead) => void;
  addLead: (input: LeadInput) => Promise<Lead | null>;
  loadDemo: () => Promise<void>;
  refreshLead: (id: string) => Promise<boolean>;
  removeLead: (id: string) => Promise<boolean>;
};

const LeadsContext = createContext<LeadsState | null>(null);

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function LeadsProvider({ children }: { children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchPage = useCallback((offset: number) => {
    api<Page>("GET", `/leads?limit=${PAGE_SIZE}&offset=${offset}`)
      .then((page) => {
        setLeads((prev) => {
          const merged = offset === 0 ? page.items : [...prev, ...page.items];
          return merged.filter((l, i) => merged.findIndex((m) => m.id === l.id) === i); // no duplicates
        });
        setTotal(page.total);
      })
      .catch((err) => setError(message(err)))
      .finally(() => setLoadingList(false));
  }, []);

  // load the first page once, when the app opens
  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    setLoadingList(true);
    fetchPage(leads.length);
  }, [fetchPage, leads.length]);

  // put the newest version of a lead into the list (or add it if it's new)
  const upsert = useCallback((lead: Lead) => {
    setLeads((prev) =>
      prev.some((l) => l.id === lead.id) ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev]
    );
  }, []);

  const addLead = useCallback(
    async (input: LeadInput) => {
      setBusy(true);
      setError("");
      try {
        const lead = await api<Lead>("POST", "/leads", input);
        upsert(lead);
        setTotal((t) => t + 1);
        return lead;
      } catch (err) {
        setError(message(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [upsert]
  );

  const loadDemo = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      for (const sample of SAMPLE_LEADS) {
        upsert(await api<Lead>("POST", "/leads", sample)); // one at a time, to respect rate limits
        setTotal((t) => t + 1);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }, [upsert]);

  // fetch one lead's full details (including chat); returns false if it doesn't exist
  const refreshLead = useCallback(
    async (id: string) => {
      try {
        upsert(await api<Lead>("GET", `/leads/${id}`));
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return false;
        setError(message(err));
        return true;
      }
    },
    [upsert]
  );

  const removeLead = useCallback(async (id: string) => {
    try {
      await api<void>("DELETE", `/leads/${id}`);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      return true;
    } catch (err) {
      setError(message(err));
      return false;
    }
  }, []);

  const sorted = [...leads].sort((a, b) => b.analysis.score - a.analysis.score);

  return (
    <LeadsContext.Provider
      value={{ leads: sorted, total, loadingList, busy, error, setError, loadMore, upsert, addLead, loadDemo, refreshLead, removeLead }}
    >
      {children}
    </LeadsContext.Provider>
  );
}

export function useLeads(): LeadsState {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error("useLeads must be used inside LeadsProvider");
  return ctx;
}
