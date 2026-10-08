import { Screen } from "@/components/ui/screen";
import { LeadsScreen } from "@/features/platform-growth/components/leads-screen";

export const metadata = { title: "Leads CRM" };

/** Super Admin › Growth › Leads CRM (template admin/leads). */
export default function AdminLeadsPage() {
  return (
    <Screen route="admin/leads" className="ap-screen">
      <LeadsScreen />
    </Screen>
  );
}
