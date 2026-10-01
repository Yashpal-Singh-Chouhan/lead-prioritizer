"use client";
// /signup: create an account and either start a team or join one with a teammate's invite code.
// Nothing is unlocked until the email address is confirmed through the link we send.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, warmUp } from "@/lib/client";
import { useSession } from "@/lib/auth";
import AuthCard, { Feedback, inputClass, primaryButton, useSlow, WakeHint } from "@/components/AuthCard";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export default function SignupPage() {
  const router = useRouter();
  const { ready, session } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teamMode, setTeamMode] = useState<"create" | "join">("create");
  const [teamName, setTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState(""); // set once the confirmation email is on its way
  const [info, setInfo] = useState("");
  const slow = useSlow(busy);

  useEffect(() => {
    if (ready && session) router.replace("/dashboard");
  }, [ready, session, router]);
  useEffect(warmUp, []);

  function check(): string {
    if (name.trim().length < 2) return "Please enter your name.";
    if (!EMAIL_RE.test(email.trim())) return "Please enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (teamMode === "create" && teamName.trim().length < 2) return "Please name your team.";
    if (teamMode === "join" && joinCode.replace(/[^a-z0-9]/gi, "").length < 8) return "Please enter the 8-character invite code.";
    return "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = check();
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    try {
      await api("POST", "/auth/signup", {
        name,
        email,
        password,
        ...(teamMode === "create" ? { team_name: teamName } : { join_code: joinCode }),
      });
      setSentTo(email.trim().toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      const res = await api<{ message: string }>("POST", "/auth/resend-verification", { email: sentTo });
      setInfo(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthCard
        title="Check your inbox"
        footer={
          <Link href="/login" className="font-semibold text-indigo-600 hover:underline">
            Back to log in
          </Link>
        }
      >
        <p className="text-sm text-slate-700">
          We sent a confirmation link to <strong>{sentTo}</strong>. Click it to activate your account. It works for 24 hours.
        </p>
        <p className="mt-2 text-xs text-slate-500">Nothing there after a minute? Check your spam folder.</p>
        <Feedback error={error} info={info} />
        <button type="button" onClick={resend} disabled={busy} className="mt-4 text-sm font-semibold text-indigo-600 hover:underline disabled:opacity-50">
          Resend the link
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Your team shares one lead list. Each lead is worked by one salesperson at a time."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-indigo-600 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-700">
          Your name
          <input className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Work email
          <input className={inputClass} type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <span className="mt-1 block text-xs font-normal text-slate-500">We&apos;ll email you a link to confirm it&apos;s really yours.</span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            className={inputClass}
            type="password"
            value={password}
            maxLength={72}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters.</span>
        </label>

        <fieldset className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">Your team</legend>
          <div className="mb-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm">
            {(
              [
                ["create", "Start a new team"],
                ["join", "Join the team"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setTeamMode(mode)}
                className={`rounded-md py-1.5 font-medium ${teamMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {teamMode === "create" ? (
            <label className="block text-sm font-medium text-slate-700">
              Team name
              <input className={inputClass} value={teamName} maxLength={60} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Pune West Sales" />
              <span className="mt-1 block text-xs font-normal text-slate-500">You&apos;ll get an invite code to share with teammates.</span>
            </label>
          ) : (
            <label className="block text-sm font-medium text-slate-700">
              Invite code
              <input
                className={`${inputClass} font-mono uppercase tracking-widest`}
                value={joinCode}
                maxLength={12}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABCD2345"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">Ask a teammate: it&apos;s shown at the top of their screen.</span>
            </label>
          )}
        </fieldset>

        <Feedback error={error} />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Creating account..." : "Create account"}
        </button>
        <WakeHint show={slow} />
      </form>
    </AuthCard>
  );
}
