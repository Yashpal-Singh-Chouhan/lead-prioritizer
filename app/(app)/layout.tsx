"use client";
// Wraps every page that needs a logged-in salesperson: checks the login,
// shows the top navigation, and provides the shared leads state.
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, useSession } from "@/lib/auth";
import { LeadsProvider } from "@/lib/leads-context";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Work leads" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // not logged in? go to the login page
  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  if (!ready || !session) return <div className="p-10 text-sm text-slate-500">Loading...</div>;

  return (
    // key: switching accounts starts with fresh, empty state
    <LeadsProvider key={session.user.id}>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-6">
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
            <div className="flex items-center gap-3 text-sm">
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
        {children}
      </div>
    </LeadsProvider>
  );
}
