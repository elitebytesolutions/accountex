import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/page";
import { Screen } from "@/components/ui/screen";
import { HistoryTab } from "@/features/history/components/history-tab";
import { SettlementScreen } from "@/features/payroll/components/settlement-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Final Settlement" };

/** One full & final settlement (template app/hr/settlement) with its row history. */
export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("fs:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/settlement">
      <SettlementScreen id={id} can={{ edit: has("fs:edit"), post: has("fs:post") }} />
      <div className="fs-print-hide">
        <Panel title="History" description="Who changed this settlement, and when">
          <HistoryTab schema="Payroll" table="FinalSettlements" id={id} />
        </Panel>
      </div>
    </Screen>
  );
}
