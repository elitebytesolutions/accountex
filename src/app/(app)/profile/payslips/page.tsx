import "@/features/self-service/ess.css";
import "@/features/payroll/payroll.css";
import { Screen } from "@/components/ui/screen";
import { MyPayslipsScreen } from "@/features/payroll/components/my-payslips-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "My Payslips" };

/** My Profile › Payslips (template app/profile/payslips): own published payslips, breakdown and year to date. */
export default async function Page() {
  await requirePermission("mypay:view");
  return (
    <Screen route="app/profile/payslips" className="es-screen">
      <MyPayslipsScreen />
    </Screen>
  );
}
