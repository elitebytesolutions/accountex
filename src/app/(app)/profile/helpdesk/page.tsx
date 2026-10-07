import { ScreenPlaceholder } from "@/features/workspace-nav/components/screen-placeholder";
import { requirePermission } from "@/lib/session";

export default async function Page() {
  await requirePermission("myhelp:view");
  return <ScreenPlaceholder title="Helpdesk" />;
}
