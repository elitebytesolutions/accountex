import { Screen } from "@/components/ui/screen";
import { HelpdeskSetupScreen } from "@/features/self-service/components/helpdesk-setup-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Helpdesk setup" };

/** Workforce › Employee engagement › Helpdesk setup (no admin template: template-style screen, Phase 15). */
export default async function Page() {
  const user = await requirePermission("emp:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/helpdesk-setup">
      <HelpdeskSetupScreen can={{ create: has("emp:create"), edit: has("emp:edit"), remove: has("emp:delete") }} />
    </Screen>
  );
}
