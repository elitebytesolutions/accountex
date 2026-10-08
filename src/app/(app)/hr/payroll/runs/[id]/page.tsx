import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/page";
import { Screen } from "@/components/ui/screen";
import { HistoryTab } from "@/features/history/components/history-tab";
import { PayrollRunWizard } from "@/features/payroll/components/payroll-run-wizard";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Payroll Run" };

/** One payroll run (template app/hr/payroll/run), opened at the step its status calls for, with its row history. */
export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("prun:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/payroll/run">
      <PayrollRunWizard runId={id} can={{ create: has("prun:create"), edit: has("prun:edit"), approve: has("prun:approve"), post: has("prun:post"), export: has("prun:export") }} />
      <Panel title="History" description="Who changed this run, and when">
        <HistoryTab schema="Payroll" table="PayrollRuns" id={id} />
      </Panel>
    </Screen>
  );
}
