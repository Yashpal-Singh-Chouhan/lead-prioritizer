"use client";
// Shared "memory" for the team's leads.
// Every page inside the app (list, new lead, lead details) reads and updates the same state here,
// so moving between pages is instant and nothing is loaded twice.
// It also listens to the server's live updates, so a teammate's claim appears without a refresh.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Lead, LeadEvent, LeadInput } from "./types";
import { api, ApiError, SAMPLE_LEADS } from "./client";
import { openLiveUpdates } from "./live";

const PAGE_SIZE = 20;
type Page = { items: Lead[]; total: number };

type LeadsState = {
  leads: Lead[]; // sorted by score, highest first
  total: number;
  loadingList: boolean;
  busy: boolean;
  error: string;
  live: boolean; // is the live-update connection open?
  notice: string; // e.g. "Priya claimed Rohit Agarwal"
  setError: (msg: string) => void;
  loadMore: () => void;
  upsert: (lead: Lead) => void;
  addLead: (input: LeadInput, claim: boolean) => Promise<Lead | null>;
  loadDemo: () => Promise<void>;
  refreshLead: (id: string) => Promise<boolean>;
  removeLead: (id: string) => Promise<boolean>;
  claimLead: (id: string) => Promise<string | null>; // null = success, otherwise the reason it failed
  releaseLead: (id: string) => Promise<string | null>;
  onLeadEvent: (listener: (event: LeadEvent) => void) => () => void;
};

const LeadsContext = createContext<LeadsState | null>(null);

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong.";
}

const VERBS: Record<string, string> = { created: "added", claimed: "claimed", released: "released", deleted: "deleted" };

export function LeadsProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [notice, setNotice] = useState("");
  const listeners = useRef(new Set<(event: LeadEvent) => void>());
  // the list as last rendered, so event handlers can check "do we have this lead?" without
  // putting side effects inside state updaters (React may run those twice)
  const leadsRef = useRef<Lead[]>([]);
  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

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

  // Live updates: apply each teammate change to our list, tell the pages, and show a short notice
  useEffect(() => {
    let noticeTimer: ReturnType<typeof setTimeout>;
    const stop = openLiveUpdates((event) => {
      if (event.type === "resync") {
        fetchPage(0);
      } else if (event.type === "deleted") {
        if (leadsRef.current.some((l) => l.id === event.leadId)) setTotal((t) => Math.max(0, t - 1));
        setLeads((prev) => prev.filter((l) => l.id !== event.leadId));
      } else if (leadsRef.current.some((l) => l.id === event.lead.id)) {
        // events don't carry the chat, so keep the chat we already have
        setLeads((prev) => prev.map((l) => (l.id === event.lead.id ? { ...event.lead, chat: l.chat } : l)));
      } else if (event.type === "created") {
        setTotal((t) => t + 1);
        setLeads((prev) => (prev.some((l) => l.id === event.lead.id) ? prev : [event.lead, ...prev]));
      }
      if (event.type !== "resync" && event.actor.id !== userId && VERBS[event.type]) {
        const name = event.type === "deleted" ? "a lead" : event.lead.name;
        setNotice(`${event.actor.name} ${VERBS[event.type]} ${name}`);
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => setNotice(""), 4000);
      }
      listeners.current.forEach((listener) => listener(event));
    }, setLive);
    return () => {
      stop();
      clearTimeout(noticeTimer);
    };
  }, [fetchPage, userId]);

  const onLeadEvent = useCallback((listener: (event: LeadEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const addLead = useCallback(
    async (input: LeadInput, claim: boolean) => {
      setBusy(true);
      setError("");
      try {
        const lead = await api<Lead>("POST", "/leads", { ...input, claim });
        // the live update for our own new lead may arrive first; count it only if it isn't there yet
        if (!leadsRef.current.some((l) => l.id === lead.id)) setTotal((t) => t + 1);
        upsert(lead);
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
        await addLead(sample, false); // one at a time, to respect rate limits; left open for the team
      }
    } finally {
      setBusy(false);
    }
  }, [addLead]);

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
      if (leadsRef.current.some((l) => l.id === id)) setTotal((t) => Math.max(0, t - 1));
      setLeads((prev) => prev.filter((l) => l.id !== id));
      return true;
    } catch (err) {
      setError(message(err));
      return false;
    }
  }, []);

  // Claim / release. If a teammate got there first, the server answers 409 with their name,
  // and we reload the lead so the screen shows who has it.
  // Pages listening with onLeadEvent hear about our own result straight away too,
  // without waiting for the server's live update to come back.
  const changeClaim = useCallback(
    async (id: string, action: "claim" | "release") => {
      const me = { id: userId, name: "" };
      const tell = (event: LeadEvent) => listeners.current.forEach((listener) => listener(event));
      try {
        const lead = await api<Lead>("POST", `/leads/${id}/${action}`);
        upsert(lead);
        tell({ type: action === "claim" ? "claimed" : "released", actor: me, lead });
        return null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const fresh = await api<Lead>("GET", `/leads/${id}`).catch(() => null);
          if (fresh) {
            upsert(fresh);
            tell({ type: "updated", actor: me, lead: fresh });
          }
        }
        return message(err);
      }
    },
    [upsert, userId]
  );
  const claimLead = useCallback((id: string) => changeClaim(id, "claim"), [changeClaim]);
  const releaseLead = useCallback((id: string) => changeClaim(id, "release"), [changeClaim]);

  const sorted = [...leads].sort((a, b) => b.analysis.score - a.analysis.score);

  return (
    <LeadsContext.Provider
      value={{
        leads: sorted,
        total,
        loadingList,
        busy,
        error,
        live,
        notice,
        setError,
        loadMore,
        upsert,
        addLead,
        loadDemo,
        refreshLead,
        removeLead,
        claimLead,
        releaseLead,
        onLeadEvent,
      }}
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
