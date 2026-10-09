import { Screen } from "@/components/ui/screen";
import { ReportsCentreScreen } from "@/features/reports/components/reports-centre-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Reports Centre" };

/** Analytics › Reports Centre (template app/reports): report catalogue, saved reports, recent runs. */
export default async function Page() {
  const user = await requirePermission("rpt:view");
  return (
    <Screen route="app/reports">
      <ReportsCentreScreen userId={user.id} userName={user.name} timeZone={user.timeZone} />
    </Screen>
  );
}
