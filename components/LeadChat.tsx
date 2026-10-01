"use client";
// Chat about ONE lead. The server answers using that lead's full context and saves the conversation.
import { useEffect, useRef, useState } from "react";
import type { Lead } from "@/lib/types";
import { api } from "@/lib/client";
import RichText from "./RichText";

const QUICK_QUESTIONS = [
  "What should I emphasize on the call?",
  "Make my reply more assertive",
  "What information should I ask the customer for?",
  "Why is this lead considered {priority}?",
  "What could prevent this customer from buying?",
  "Give me a short call script",
];

export default function LeadChat({ lead, onChange, canWork }: { lead: Lead; onChange: (lead: Lead) => void; canWork: boolean }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(""); // the question being answered right now
  const box = useRef<HTMLDivElement>(null);

  // keep the newest message in view by scrolling the chat box only (not the whole page,
  // which would jump to the bottom every time a lead is opened)
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lead.chat.length, pending]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setPending(question); // show the question immediately
    setInput("");
    setBusy(true);
    setError("");
    try {
      // the server saves the question + answer in the database and returns the updated lead
      onChange(await api<Lead>("POST", `/leads/${lead.id}/chat`, { question }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setInput(question); // give the question back so it can be retried
    } finally {
      setPending("");
      setBusy(false);
    }
  }

  const priority = lead.analysis.priority.toLowerCase();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900">💬 Ask AI about {lead.name}</h3>
      <p className="mb-3 text-xs text-slate-500">
        Every answer uses this lead&apos;s details, message, AI analysis, action plan and call history. The conversation is saved with the lead.
      </p>

      {(lead.chat.length > 0 || pending) && (
        <div ref={box} className="mb-3 max-h-[28rem] space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
          {lead.chat.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-10 whitespace-pre-wrap rounded-xl bg-indigo-600 px-3 py-2 text-sm text-white">
                {m.content}
              </div>
            ) : (
              <div key={i} className="mr-6 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                <RichText text={m.content} />
              </div>
            )
          )}
          {pending && <div className="ml-10 whitespace-pre-wrap rounded-xl bg-indigo-600 px-3 py-2 text-sm text-white">{pending}</div>}
          {busy && <div className="mr-6 animate-pulse rounded-xl bg-white px-3 py-2 text-sm text-slate-500">Thinking about {lead.name}...</div>}
        </div>
      )}

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {!canWork ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
          {lead.claimedBy ? `Only ${lead.claimedBy.name} can ask AI about this lead.` : "Claim this lead to ask AI about it."}
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_QUESTIONS.map((template) => {
              const q = template.replace("{priority}", priority);
              return (
                <button
                  key={template}
                  type="button"
                  onClick={() => send(q)}
                  disabled={busy}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
                >
                  {q}
                </button>
              );
            })}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              value={input}
              maxLength={1000}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask anything about ${lead.name}...`}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
