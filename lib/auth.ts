"use client";
// Keeps track of who is logged in. The login token is saved in this browser (localStorage)
// so a refresh doesn't log you out. useSession() lets any component react to login/logout.
import { useMemo, useSyncExternalStore } from "react";

export type SessionUser = { id: string; name: string; email: string };
export type Session = { token: string; user: SessionUser };

const KEY = "lead-prioritizer:session";
const EVENT = "lead-prioritizer:session-change";

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function readSession(): Session | null {
  const raw = readRaw();
  try {
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // storage blocked: the session will only last until refresh
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback); // login/logout in another tab
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

// ready = false while the page is still being prepared on the server (no localStorage there)
export function useSession(): { ready: boolean; session: Session | null } {
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, readRaw, () => undefined);
  const session = useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }, [raw]);
  return { ready: raw !== undefined, session };
}
