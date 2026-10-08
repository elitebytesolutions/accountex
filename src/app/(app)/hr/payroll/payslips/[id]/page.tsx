import "@/features/payroll/payroll.css";
import { Screen } from "@/components/ui/screen";
import { PayslipView } from "@/features/payroll/components/payslip-view";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Payslip" };

/** The printable payslip (template app/hr/payroll/payslip). `?print=1` opens the print dialog once loaded. */
export default async function PayslipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  await requirePermission("prun:view");
  const [{ id }, { print }] = await Promise.all([params, searchParams]);
  return (
    <Screen route="app/hr/payroll/payslip">
      <PayslipView id={id} autoPrint={print === "1"} />
    </Screen>
  );
}
