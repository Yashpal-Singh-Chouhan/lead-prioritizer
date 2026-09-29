"use client";
// The intake form. Collects the 6 fields and hands them to the page to analyze.
import { useState } from "react";
import type { LeadInput } from "@/lib/types";
import { SAMPLE_LEADS, validateLead } from "@/lib/client";

const EMPTY: LeadInput = { name: "", location: "", requirement: "", budget: "", timeline: "", message: "" };

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export default function LeadForm({
  onSubmit,
  busy,
}: {
  onSubmit: (lead: LeadInput) => Promise<boolean>;
  busy: boolean;
}) {
  const [form, setForm] = useState<LeadInput>(EMPTY);
  const [problem, setProblem] = useState("");

  function update(field: keyof LeadInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    const issue = validateLead(form); // quick check in the browser; the server checks again
    setProblem(issue ?? "");
    if (issue) return;
    const ok = await onSubmit(form);
    if (ok) setForm(EMPTY);
  }

  const canSubmit = form.name.trim() !== "" && form.message.trim() !== "" && !busy;
  const limits = { name: 80, location: 120, requirement: 200, budget: 60 };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">New lead</h2>
        <button
          type="button"
          onClick={() => setForm(SAMPLE_LEADS[Math.floor(Math.random() * SAMPLE_LEADS.length)])}
          className="text-sm text-indigo-600 hover:underline"
        >
          Fill with an example
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Name *
          <input className={`${inputClass} mt-1`} maxLength={limits.name} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Rohit Agarwal" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Location
          <input className={`${inputClass} mt-1`} maxLength={limits.location} value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="e.g. Whitefield, Bangalore" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Property requirement
          <input className={`${inputClass} mt-1`} maxLength={limits.requirement} value={form.requirement} onChange={(e) => update("requirement", e.target.value)} placeholder="e.g. 3BHK, ready to move" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Budget
          <input className={`${inputClass} mt-1`} maxLength={limits.budget} value={form.budget} onChange={(e) => update("budget", e.target.value)} placeholder="e.g. ₹1.2 Cr" />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          Buying timeline
          <select className={`${inputClass} mt-1`} value={form.timeline} onChange={(e) => update("timeline", e.target.value)}>
            <option value="">Not specified</option>
            <option>Within 1 month</option>
            <option>1-3 months</option>
            <option>3-6 months</option>
            <option>6+ months</option>
            <option>Just exploring</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          Customer message / chat transcript *
          <textarea className={`${inputClass} mt-1 min-h-32`} maxLength={2000} value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="Paste the customer's inquiry or chat here" />
        </label>
      </div>

      {problem && <p className="mt-4 text-sm text-red-600">{problem}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {busy ? "Analyzing with AI..." : "Analyze & save lead"}
      </button>
    </div>
  );
}
