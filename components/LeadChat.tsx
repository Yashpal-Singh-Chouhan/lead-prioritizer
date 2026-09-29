"use client";
// Chat about ONE lead. The server answers using that lead's full context and saves the conversation.
import { useState } from "react";
import type { Lead } from "@/lib/types";
import { api } from "@/lib/client";

const QUICK_QUESTIONS = [
  "What should I emphasize on the call?",
  "Make my reply more assertive",
  "How do I handle their main objection?",
];

export default function LeadChat({ lead, onChange }: { lead: Lead; onChange: (lead: Lead) => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [pending, setPending] = useState(""); // the question being answered right now

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setPending(question); // show the question immediately
    setInput("");
    setBusy(true);
    setError("");
    try {
      // the server saves the question + answer in the database and returns the updated lead
      onChange(await api<Lead>("POST", `/leads/${lead.id}/chat`, { message: question }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending("");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900">Ask AI about {lead.name}</h3>
      <p className="mb-3 text-xs text-slate-500">Answers use this lead&apos;s details, analysis and call history.</p>

      <div className="mb-3 max-h-80 space-y-3 overflow-y-auto">
        {lead.chat.map((m, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
              m.role === "user" ? "ml-8 bg-indigo-600 text-white" : "mr-8 bg-slate-100 text-slate-800"
            }`}
          >
            {m.content}
          </div>
        ))}
        {pending && <div className="ml-8 whitespace-pre-wrap rounded-xl bg-indigo-600 px-3 py-2 text-sm text-white">{pending}</div>}
        {busy && <div className="mr-8 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-500">Thinking...</div>}
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="mb-2 flex flex-wrap gap-2">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => send(q)}
            disabled={busy}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask a follow-up question..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
        >
          Send
        </button>
      </div>
    </div>
  );
}
