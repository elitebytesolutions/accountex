import { SetupGuideScreen } from "@/features/settings/components/setup-guide";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Setup Guide" };

export default async function SetupPage() {
  const user = await requirePermission("comp:view");
  return <SetupGuideScreen userName={user.name} companyName={user.tenantName} canEdit={user.permissions.includes("comp:edit")} />;
}
