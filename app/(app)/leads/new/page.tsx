"use client";
// /leads/new: the intake form. After the AI analyzes the lead, we open it.
import { useRouter } from "next/navigation";
import { useLeads } from "@/lib/leads-context";
import LeadForm from "@/components/LeadForm";
import BackButton from "@/components/BackButton";
import type { LeadInput } from "@/lib/types";

export default function NewLeadPage() {
  const { addLead, busy } = useLeads();
  const router = useRouter();

  async function handleSubmit(input: LeadInput, claim: boolean) {
    const lead = await addLead(input, claim);
    // replace, not push: Back from the new lead goes to where you were, not to an emptied form
    if (lead) router.replace(`/leads/${lead.id}`);
    return lead !== null;
  }

  return (
    <>
      <BackButton fallback="/leads" />
      <LeadForm onSubmit={handleSubmit} busy={busy} />
    </>
  );
}
