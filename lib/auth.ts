"use client";
// Keeps track of who is logged in. The login token is kept in sessionStorage: it survives a refresh,
// but closing the tab or browser logs you out, and every new tab starts at the login page.
// (It also means two tabs can be two different salespeople, which is handy for demos.)
// useSession() lets any component react to login/logout.
import { useMemo, useSyncExternalStore } from "react";

export type Team = { id: string; name: string; joinCode: string | null }; // no code for the demo team
export type SessionUser = { id: string; name: string; email: string; team: Team | null };
export type Session = { token: string; user: SessionUser };

const KEY = "lead-prioritizer:session";
const EVENT = "lead-prioritizer:session-change";

function readRaw(): string | null {
  try {
    return sessionStorage.getItem(KEY);
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
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // storage blocked: the session will only last until refresh
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

// ready = false while the page is still being prepared on the server (no sessionStorage there)
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
