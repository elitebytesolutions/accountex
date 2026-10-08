import { Screen } from "@/components/ui/screen";
import { LeadConvert } from "@/features/platform-growth/components/lead-convert";

export const metadata = { title: "Onboard lead" };

/** Super Admin › Growth › Leads CRM › Onboard: the Phase 40 onboarding wizard pre-filled from a lead. */
export default async function AdminLeadConvertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Screen route="admin/tenants/new">
      <LeadConvert key={id} id={id} />
    </Screen>
  );
}
