"use client";
// /verify-email?token=...: the page the confirmation email links to.
// It waits for a click instead of confirming on page load, because some email apps open
// links automatically to scan them, which would use up the one-time link.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { saveSession, type Session } from "@/lib/auth";
import AuthCard, { Feedback, primaryButton, useSlow, WakeHint } from "@/components/AuthCard";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}

function VerifyEmail() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const slow = useSlow(busy);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      saveSession(await api<Session>("POST", "/auth/verify-email", { token }));
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Confirm your email"
      subtitle="One click and your account is active."
      footer={
        <>
          Link expired? Log in and we&apos;ll offer to send a new one.{" "}
          <Link href="/login" className="font-semibold text-indigo-600 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {token ? (
        <>
          <button type="button" onClick={confirm} disabled={busy} className={primaryButton}>
            {busy ? "Confirming..." : "Confirm my email"}
          </button>
          <WakeHint show={slow} />
        </>
      ) : (
        <p className="text-sm text-slate-700">This link is missing its code. Open the link from the email again.</p>
      )}
      <Feedback error={error} />
    </AuthCard>
  );
}
