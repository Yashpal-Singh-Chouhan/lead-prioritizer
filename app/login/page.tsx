"use client";
// /login: log in, or try one of the two demo salespeople in one click.
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, warmUp } from "@/lib/client";
import { saveSession, useSession, type Session } from "@/lib/auth";
import AuthCard, { Feedback, inputClass, primaryButton, safeNext, useSlow, WakeHint } from "@/components/AuthCard";

export default function LoginPage() {
  // useSearchParams (for ?next=) needs a Suspense boundary in production builds
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { ready, session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [unverified, setUnverified] = useState(false);
  const slow = useSlow(busy);

  // already logged in (in this tab)? go straight on
  useEffect(() => {
    if (ready && session) router.replace(next);
  }, [ready, session, router, next]);

  // start waking the server while the person types
  useEffect(warmUp, []);

  async function submit(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    setInfo("");
    setUnverified(false);
    try {
      saveSession(await api<Session>("POST", path, body)); // the effect above then redirects
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setUnverified(true);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ message: string }>("POST", "/auth/resend-verification", { email });
      setInfo(res.message);
      setUnverified(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Log in"
      subtitle="AI-ranked leads, so your team calls the right people first."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-semibold text-indigo-600 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {(["a", "b"] as const).map((who) => (
          <button
            key={who}
            type="button"
            onClick={() => submit("/auth/demo", { who })}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Demo salesperson {who.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-center text-xs text-slate-400">
        No sign-up needed. Open A and B in two tabs to watch claims sync live.
      </p>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" /> or use your own account <div className="h-px flex-1 bg-slate-200" />
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit("/auth/login", { email, password });
        }}
      >
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input className={inputClass} type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          <span className="flex justify-between">
            Password
            <Link href="/forgot-password" className="font-normal text-indigo-600 hover:underline">
              Forgot password?
            </Link>
          </span>
          <input
            className={inputClass}
            type="password"
            value={password}
            maxLength={72}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        <Feedback error={error} info={info} />
        {unverified && (
          <button type="button" onClick={resend} disabled={busy} className="text-sm font-semibold text-indigo-600 hover:underline disabled:opacity-50">
            Send me a new confirmation link
          </button>
        )}

        <button type="submit" disabled={busy || !email || !password} className={primaryButton}>
          {busy ? "Please wait..." : "Log in"}
        </button>
        <WakeHint show={slow} />
      </form>
    </AuthCard>
  );
}
