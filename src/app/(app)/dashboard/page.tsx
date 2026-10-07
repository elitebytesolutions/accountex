import { LayoutGrid } from "lucide-react";
import { PageHead, Panel } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <>
      <PageHead eyebrow="Workspace / Dashboard" title={`Welcome, ${user.name}`} description={user.tenantName} />
      <Panel>
        <EmptyState
          icon={<LayoutGrid />}
          title="Your dashboard fills in as modules arrive"
          description="Finance, sales, stock and HR widgets appear here once their phases are delivered (see docs/delivery/ROADMAP.md)."
        />
      </Panel>
    </>
  );
}
