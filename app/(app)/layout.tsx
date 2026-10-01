"use client";
// Wraps every page that needs a logged-in salesperson: checks the login WITH THE SERVER before
// showing anything, shows the top navigation, and provides the shared team leads state.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, saveSession, useSession, type Session, type SessionUser } from "@/lib/auth";
import { api, ApiError } from "@/lib/client";
import { LeadsProvider, useLeads } from "@/lib/leads-context";
import { useTrackPages } from "@/lib/nav";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Work leads" },
];

function Splash({ title, detail, children }: { title: string; detail?: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
        <p className="font-semibold text-slate-900">{title}</p>
        {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
        {children}
      </div>
    </main>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useTrackPages();

  // not logged in (in this tab)? go to the login page, and come back here afterwards
  useEffect(() => {
    if (ready && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, session, router, pathname]);

  if (!ready || !session) return <Splash title="Opening Lead Prioritizer..." />;
  // keyed by token: a different login starts a fresh check and fresh, empty state
  return (
    <VerifiedApp key={session.token} session={session}>
      {children}
    </VerifiedApp>
  );
}

// Nothing from the app is shown until the server confirms the saved login is still valid.
// On the free hosting plan the server sleeps when idle, so this is also where we wait for it to wake up.
function VerifiedApp({ session, children }: { session: Session; children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking");
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const slowTimer = setTimeout(() => active && setSlow(true), 3000);
    api<SessionUser>("GET", "/auth/me")
      .then((user) => {
        if (!active) return;
        saveSession({ token: session.token, user }); // fresh name and team from the server
        setStatus("ok");
      })
      .catch((err) => {
        // 401: api() already cleared the session, and the layout redirects to the login page
        if (active && !(err instanceof ApiError && err.status === 401)) setStatus("error");
      })
      .finally(() => clearTimeout(slowTimer));
    return () => {
      active = false;
      clearTimeout(slowTimer);
    };
  }, [session.token, attempt]);

  if (status === "error") {
    return (
      <Splash title="Can't reach the server" detail="It may still be waking up. Please try again in a few seconds.">
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setStatus("checking");
              setAttempt((a) => a + 1);
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>
          <button type="button" onClick={clearSession} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            Log out
          </button>
        </div>
      </Splash>
    );
  }
  if (status === "checking") {
    return (
      <Splash
        title={slow ? "Waking up the server..." : "Checking your login..."}
        detail={slow ? "The free server sleeps when nobody uses it. The first visit can take up to a minute." : undefined}
      />
    );
  }

  return (
    <LeadsProvider userId={session.user.id}>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Header session={session} />
        {children}
        <TeamNotice />
      </div>
    </LeadsProvider>
  );
}

function Header({ session }: { session: Session }) {
  const router = useRouter();
  const pathname = usePathname();
  const { live } = useLeads();
  const [copied, setCopied] = useState(false);
  const team = session.user.team;

  async function copyCode() {
    if (!team?.joinCode) return;
    await navigator.clipboard.writeText(team.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-6">
          <Link href="/dashboard" className="text-lg font-bold">
            🏠 Lead Prioritizer
          </Link>
          <nav className="flex gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  pathname.startsWith(item.href) ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span
            title={live ? "Changes by teammates appear instantly" : "Reconnecting to live updates..."}
            className={`flex items-center gap-1.5 text-xs font-medium ${live ? "text-emerald-700" : "text-amber-700"}`}
          >
            <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "animate-pulse bg-amber-500"}`} />
            {live ? "Live" : "Connecting"}
          </span>
          {team && (
            <span className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
              👥 {team.name}
              {team.joinCode && (
                <button
                  type="button"
                  onClick={copyCode}
                  title="Teammates enter this code when they sign up"
                  className="rounded bg-white px-1.5 py-0.5 font-mono font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  {copied ? "Copied ✓" : `Invite code ${team.joinCode}`}
                </button>
              )}
            </span>
          )}
          <span className="text-slate-600">👤 {session.user.name}</span>
          <button
            type="button"
            onClick={() => {
              clearSession();
              router.replace("/login");
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}

// A short pop-up when a teammate claims, releases, adds or deletes a lead
function TeamNotice() {
  const { notice } = useLeads();
  if (!notice) return null;
  return (
    <div role="status" className="fixed bottom-4 right-4 z-50 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
      🔔 {notice}
    </div>
  );
}
