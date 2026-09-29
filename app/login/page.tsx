"use client";
// /login: log in, sign up, or try the demo account in one click.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { saveSession, useSession, type Session } from "@/lib/auth";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export default function LoginPage() {
  const router = useRouter();
  const { ready, session } = useSession();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // already logged in? go straight to the dashboard
  useEffect(() => {
    if (ready && session) router.replace("/dashboard");
  }, [ready, session, router]);

  async function submit(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      saveSession(await api<Session>("POST", path, body)); // the layout effect above then redirects
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit() {
    if (mode === "signup") {
      if (name.trim().length < 2) return setError("Please enter your name.");
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      submit("/auth/signup", { name, email, password });
    } else {
      submit("/auth/login", { email, password });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Lead Prioritizer</h1>
        <p className="mb-5 text-sm text-slate-500">AI-ranked leads, so you call the right people first.</p>

        <button
          type="button"
          onClick={() => submit("/auth/demo")}
          disabled={busy}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Try the demo account
        </button>
        <p className="mt-1 text-center text-xs text-slate-400">No sign-up needed. Shared demo data.</p>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" /> or use your own account <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError("");
              }}
              className={`rounded-md py-1.5 font-medium ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === "signup" && (
            <label className="block text-sm font-medium text-slate-700">
              Your name
              <input className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input className={inputClass} type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              className={inputClass}
              type="password"
              value={password}
              maxLength={72}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !email || !password}
          className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
        >
          {busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
        </button>
      </div>
    </main>
  );
}
