import "@/features/self-service/ess.css";
import "@/features/payroll/payroll.css";
import { Screen } from "@/components/ui/screen";
import { MyLoansScreen } from "@/features/payroll/components/my-loans-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Loans & Advances" };

/** My Profile › Loans & Advances (template app/profile/loans): own loans, eligibility and requests. */
export default async function Page() {
  const user = await requirePermission("myloan:view");
  return (
    <Screen route="app/profile/loans" className="es-screen">
      <MyLoansScreen canRequest={user.permissions.includes("myloan:create")} />
    </Screen>
  );
}
