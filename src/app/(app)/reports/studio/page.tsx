import { Screen } from "@/components/ui/screen";
import { ReportStudioScreen } from "@/features/reports/components/report-studio-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Report Studio" };

/** Analytics › Report Studio (template app/reports/studio). Each data source also needs its module's view permission. */
export default async function Page() {
  const user = await requirePermission("rpt:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/reports/studio">
      <ReportStudioScreen userId={user.id} can={{ create: has("rpt:create"), edit: has("rpt:edit"), remove: has("rpt:delete") }} />
    </Screen>
  );
}
