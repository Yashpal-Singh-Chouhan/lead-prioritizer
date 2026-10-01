"use client";
// The intake form. Collects the lead, checks every field, and hands it to the page to analyze.
import { useState } from "react";
import type { LeadInput } from "@/lib/types";
import { SAMPLE_LEADS, TIMELINES, validateLead, type LeadErrors } from "@/lib/client";

const EMPTY: LeadInput = { name: "", phone: "", email: "", location: "", requirement: "", budget: "", timeline: "", message: "" };

const inputClass =
  "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2";

function Field({
  label,
  required,
  error,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${className}`}>
      {label}
      {required ? <span className="text-red-500"> *</span> : <span className="font-normal text-slate-400"> (optional)</span>}
      {children}
      {error && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}
    </label>
  );
}

export default function LeadForm({
  onSubmit,
  busy,
}: {
  onSubmit: (lead: LeadInput, claim: boolean) => Promise<boolean>;
  busy: boolean;
}) {
  const [form, setForm] = useState<LeadInput>(EMPTY);
  const [errors, setErrors] = useState<LeadErrors>({});
  const [sample, setSample] = useState(0);
  const [claim, setClaim] = useState(true); // e.g. your own walk-in or phone inquiry

  function update(field: keyof LeadInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined })); // clear the error once the user edits the field
  }

  // red border on invalid fields, so problems are visible at a glance
  function box(field: keyof LeadInput) {
    return `${inputClass} ${errors[field] ? "border-red-400 focus:ring-red-200" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200"}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateLead(form); // quick check in the browser; the server checks again
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const ok = await onSubmit(form, claim);
    if (ok) setForm(EMPTY);
  }

  function fillExample() {
    setForm(SAMPLE_LEADS[sample % SAMPLE_LEADS.length]);
    setSample((n) => n + 1);
    setErrors({});
  }

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">New lead</h2>
          <p className="text-xs text-slate-500">The AI analyzes and scores the lead as soon as you save it.</p>
        </div>
        <button type="button" onClick={fillExample} className="shrink-0 text-sm text-indigo-600 hover:underline">
          Fill with an example
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name}>
          <input className={box("name")} maxLength={80} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Rahul Sharma" />
        </Field>
        <Field label="Location" required error={errors.location}>
          <input className={box("location")} maxLength={120} value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="e.g. Hinjewadi, Pune" />
        </Field>
        <Field label="Property requirement" required error={errors.requirement}>
          <input className={box("requirement")} maxLength={200} value={form.requirement} onChange={(e) => update("requirement", e.target.value)} placeholder="e.g. 2BHK apartment" />
        </Field>
        <Field label="Budget" required error={errors.budget}>
          <input className={box("budget")} maxLength={60} value={form.budget} onChange={(e) => update("budget", e.target.value)} placeholder="e.g. ₹80 lakh (or 'Not shared')" />
        </Field>
        <Field label="Buying timeline" required error={errors.timeline}>
          <select className={box("timeline")} value={form.timeline} onChange={(e) => update("timeline", e.target.value)}>
            <option value="" disabled>
              Select a timeline
            </option>
            {TIMELINES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Phone number" error={errors.phone}>
          <input
            className={box("phone")}
            type="tel"
            inputMode="tel"
            maxLength={20}
            value={form.phone}
            // only digits, spaces and + - ( ) can even be typed into this box
            onChange={(e) => update("phone", e.target.value.replace(/[^\d+\s()-]/g, ""))}
            placeholder="e.g. 98220 12345"
          />
        </Field>
        <Field label="Email" error={errors.email} className="sm:col-span-2">
          <input
            className={box("email")}
            type="email"
            inputMode="email"
            maxLength={254}
            value={form.email}
            onChange={(e) => update("email", e.target.value.replace(/\s/g, ""))}
            placeholder="e.g. rahul@example.com"
          />
        </Field>
        <Field label="Customer message" required error={errors.message} className="sm:col-span-2">
          <textarea
            className={`${box("message")} min-h-32`}
            maxLength={2000}
            value={form.message}
            onChange={(e) => update("message", e.target.value)}
            placeholder="Paste what the customer wrote, e.g. &quot;Hi, I'm looking for a 2BHK apartment near Hinjewadi. My budget is around 80 lakhs...&quot;"
          />
          <span className="mt-1 block text-right text-xs font-normal text-slate-400">{form.message.length}/2000</span>
        </Field>
      </div>

      {errorCount > 0 && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Please fix {errorCount} field{errorCount > 1 ? "s" : ""} marked in red.
        </p>
      )}

      <label className="mt-5 flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={claim} onChange={(e) => setClaim(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
        <span>
          <span className="font-medium">I&apos;ll handle this lead myself</span>
          <span className="block text-xs text-slate-500">Claims it for you right away. Untick to leave it open for anyone in your team.</span>
        </span>
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:bg-indigo-300"
      >
        {busy ? "Analyzing with AI... (takes a few seconds)" : "Analyze & save lead"}
      </button>
    </form>
  );
}
