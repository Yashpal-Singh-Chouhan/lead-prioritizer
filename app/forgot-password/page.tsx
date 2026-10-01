"use client";
// /forgot-password: we email a one-time link to choose a new password.
// The answer is the same whether or not the email has an account, so this page can't be used
// to find out who uses the app.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, warmUp } from "@/lib/client";
import AuthCard, { Feedback, inputClass, primaryButton, useSlow, WakeHint } from "@/components/AuthCard";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const slow = useSlow(busy);
  useEffect(warmUp, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await api<{ message: string }>("POST", "/auth/forgot-password", { email });
      setInfo(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your account email and we'll send you a link to choose a new one."
      footer={
        <Link href="/login" className="font-semibold text-indigo-600 hover:underline">
          Back to log in
        </Link>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input className={inputClass} type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <Feedback error={error} info={info} />
        <button type="submit" disabled={busy || !email} className={primaryButton}>
          {busy ? "Sending..." : "Email me a reset link"}
        </button>
        <WakeHint show={slow} />
      </form>
    </AuthCard>
  );
}
