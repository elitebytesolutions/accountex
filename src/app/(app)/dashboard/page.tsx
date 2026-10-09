import "@/features/hr/attendance.css";
import "@/features/payroll/payroll-dash.css";
import "@/features/work/dashboard.css";
import { Screen } from "@/components/ui/screen";
import { DashboardScreen } from "@/features/work/components/dashboard-screen";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Dashboard" };

/** Template app/dashboard (48-dash-stock.html): the workspace overview from posted data (Phase 44). Every signed-in user. */
export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <Screen route="app/dashboard" className="fd-screen fd-grown">
      <DashboardScreen firstName={user.name.split(" ")[0] ?? user.name} />
    </Screen>
  );
}
