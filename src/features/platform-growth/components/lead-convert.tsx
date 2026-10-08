"use client";

import { useEffect, useState } from "react";
import type { LeadDetail } from "@/shared";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { OnboardWizard, type OnboardWizardValues } from "@/features/platform-tenants/components/onboard-wizard";
import { ApiError } from "@/lib/api/errors";
import { convertLead, getLead } from "../api";

/** A tenant code from a company name: lower-case letters and digits, at most 20. */
const codeOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20);

/**
 * Leads CRM › Onboard: the Phase 40 onboarding wizard pre-filled from the lead (company, city, contact, plan);
 * provisioning goes through POST /api/admin/leads/:id/convert, which onboards the company and links the lead (PAID).
 */
export function LeadConvert({ id }: { id: string }) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLead(id).then((l) => !cancelled && setLead(l))
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the lead" }));
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <ErrorState {...error} />;
  if (!lead) return <Skeleton style={{ height: 480, borderRadius: 18 }} />;
  if (lead.tenantId) {
    return <Banner tone="info" title={`${lead.companyName} is already onboarded`}>It was converted to {lead.tenantName} ({lead.tenantCode?.toUpperCase()}).</Banner>;
  }
  const initial: Partial<OnboardWizardValues> = {
    displayName: lead.companyName, legalName: lead.companyName, city: lead.city ?? "", phone: lead.phone ?? "", email: lead.email ?? "",
    code: codeOf(lead.companyName), planId: lead.planInterestId ?? "", adminName: lead.contactPerson ?? "", adminEmail: lead.email ?? "",
    adminMobile: lead.phone ?? "",
  };
  return <OnboardWizard initial={initial} eyebrow={`Growth / Leads CRM / ${lead.companyName}`} submit={(body) => convertLead(lead.id, body)} />;
}
