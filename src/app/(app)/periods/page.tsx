import { PeriodsScreen } from "@/features/finance/components/periods-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Fiscal Periods" };

export default async function PeriodsPage() {
  const user = await requirePermission("close:view");
  return <PeriodsScreen canManage={user.permissions.includes("close:approve")} />;
}
