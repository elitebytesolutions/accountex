import "@/features/self-service/ess.css";
import "@/features/payroll/payroll.css";
import { Screen } from "@/components/ui/screen";
import { MyTaxScreen } from "@/features/payroll/components/my-tax-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Tax Declarations" };

/** My Profile › Tax (template app/profile/tax): projection under the salaried slabs and declarations with proof upload. */
export default async function Page() {
  const user = await requirePermission("mytax:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/profile/tax" className="es-screen">
      <MyTaxScreen can={{ create: has("mytax:create"), edit: has("mytax:edit") }} />
    </Screen>
  );
}
