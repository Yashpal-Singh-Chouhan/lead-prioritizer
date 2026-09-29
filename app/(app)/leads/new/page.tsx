"use client";
// /leads/new: the intake form. After the AI analyzes the lead, we open it.
import { useRouter } from "next/navigation";
import { useLeads } from "@/lib/leads-context";
import LeadForm from "@/components/LeadForm";
import type { LeadInput } from "@/lib/types";

export default function NewLeadPage() {
  const { addLead, busy } = useLeads();
  const router = useRouter();

  async function handleSubmit(input: LeadInput) {
    const lead = await addLead(input);
    if (lead) router.push(`/leads/${lead.id}`);
    return lead !== null;
  }

  return <LeadForm onSubmit={handleSubmit} busy={busy} />;
}
