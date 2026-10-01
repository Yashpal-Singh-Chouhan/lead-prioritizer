"use client";
// "← Back": same as the browser's back button when there is an earlier page in the app,
// otherwise it goes to a sensible parent page (e.g. when a lead link was opened directly).
import { useRouter } from "next/navigation";
import { hasInAppHistory } from "@/lib/nav";

export default function BackButton({ fallback = "/dashboard", label = "Back" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (hasInAppHistory() ? router.back() : router.push(fallback))}
      className="mb-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      ← {label}
    </button>
  );
}
