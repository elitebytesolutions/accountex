import { ApprovalsScreen } from "@/features/access/components/approvals-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Approval Workflows" };

export default async function ApprovalsPage() {
  const user = await requirePermission("wf:view");
  const has = (p: string) => user.permissions.includes(p);
  return <ApprovalsScreen can={{ create: has("wf:create"), edit: has("wf:edit"), remove: has("wf:delete") }} />;
}
