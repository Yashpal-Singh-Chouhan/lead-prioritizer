"use client";
// /leads/<id>: one lead's analysis, reply, call logger and chat. Has its own shareable URL.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLeads } from "@/lib/leads-context";
import LeadDetail from "@/components/LeadDetail";
import BackButton from "@/components/BackButton";

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const { leads, upsert, refreshLead, removeLead } = useLeads();
  const router = useRouter();
  const [missingId, setMissingId] = useState<string | null>(null);

  // always fetch the full, latest version of this lead (including its chat history)
  useEffect(() => {
    let active = true;
    refreshLead(id).then((found) => {
      if (active && !found) setMissingId(id);
    });
    return () => {
      active = false;
    };
  }, [id, refreshLead]);

  const lead = leads.find((l) => l.id === id);

  if (missingId === id) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
        This lead doesn&apos;t exist or isn&apos;t in your team.{" "}
        <Link href="/leads" className="text-indigo-600 hover:underline">
          Back to leads
        </Link>
      </div>
    );
  }
  if (!lead) return <p className="text-sm text-slate-500">Loading lead...</p>;

  return (
    <>
      <BackButton fallback="/dashboard" />
      <LeadDetail
        key={lead.id}
        lead={lead}
        onChange={upsert}
        onDelete={async (leadId) => {
          // replace: Back must not lead to the page of a lead that no longer exists
          if (await removeLead(leadId)) router.replace("/leads");
        }}
      />
    </>
  );
}
