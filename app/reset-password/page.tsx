"use client";
// /reset-password?token=...: the page the reset email links to. Choosing a new password also
// logs out every device that was still logged in with the old one.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { saveSession, type Session } from "@/lib/auth";
import AuthCard, { Feedback, inputClass, primaryButton, useSlow, WakeHint } from "@/components/AuthCard";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPassword />
    </Suspense>
  );
}

function ResetPassword() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const slow = useSlow(busy);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError("");
    try {
      saveSession(await api<Session>("POST", "/auth/reset-password", { token, password }));
      router.replace("/dashboard"); // replace: Back shouldn't return to a used reset link
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <Link href="/forgot-password" className="font-semibold text-indigo-600 hover:underline">
      Request a new link
    </Link>
  );

  if (!token) {
    return (
      <AuthCard title="Link incomplete" footer={footer}>
        <p className="text-sm text-slate-700">This reset link is missing its code. Open the link from the email again, or request a new one.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="You'll be logged in right after." footer={footer}>
      <form className="space-y-3" onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-700">
          New password
          <input
            className={inputClass}
            type="password"
            value={password}
            maxLength={72}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Repeat new password
          <input
            className={inputClass}
            type="password"
            value={confirm}
            maxLength={72}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <Feedback error={error} />
        <button type="submit" disabled={busy || !password || !confirm} className={primaryButton}>
          {busy ? "Saving..." : "Save new password"}
        </button>
        <WakeHint show={slow} />
      </form>
    </AuthCard>
  );
}
