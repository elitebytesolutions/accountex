import { CostCentresScreen } from "@/features/finance/components/cost-centres-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Cost Centres & Projects" };

export default async function CostCentresPage() {
  const user = await requirePermission("coa:view");
  const has = (p: string) => user.permissions.includes(p);
  return <CostCentresScreen can={{ create: has("coa:create"), edit: has("coa:edit"), remove: has("coa:delete") }} />;
}
