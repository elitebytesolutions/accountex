import { redirect } from "next/navigation";
import { Screen } from "@/components/ui/screen";
import { PayrollRunWizard } from "@/features/payroll/components/payroll-run-wizard";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Run Payroll" };

/** Workforce › Payroll › Run (template app/hr/payroll/run): step 1 of a new run; ?id= opens an existing run. */
export default async function RunPayrollPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await requirePermission("prun:view");
  const { id } = await searchParams;
  if (id && /^[0-9a-f-]{36}$/i.test(id)) redirect(`/hr/payroll/runs/${id}`);
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/payroll/run">
      <PayrollRunWizard can={{ create: has("prun:create"), edit: has("prun:edit"), approve: has("prun:approve"), post: has("prun:post"), export: has("prun:export") }} />
    </Screen>
  );
}
