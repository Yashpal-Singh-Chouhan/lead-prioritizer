"use client";
// Shared look and helpers for the pages you see before logging in
// (/login, /signup, /forgot-password, /reset-password, /verify-email). Each is its own page,
// so the browser's back button moves between them like any other website.
import { useEffect, useState } from "react";
import Link from "next/link";

export const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export const primaryButton =
  "w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300";

// Only allow returning to a page of our own site after login (never an outside website)
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

// True once a request has been running for a few seconds: the sleeping free server is waking up
export function useSlow(busy: boolean, afterMs = 4000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), afterMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [busy, afterMs]);
  return slow;
}

export function Feedback({ error, info }: { error?: string; info?: string }) {
  return (
    <>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>}
    </>
  );
}

export function WakeHint({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="mt-2 text-center text-xs text-amber-700">Waking up the free server... the first request can take up to a minute.</p>;
}

export default function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-4 block text-center text-lg font-bold text-slate-900">
          🏠 Lead Prioritizer
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mb-5 mt-1 text-sm text-slate-500">{subtitle}</p>}
          {children}
        </div>
        {footer && <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>}
      </div>
    </main>
  );
}
