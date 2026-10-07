import { Screen } from "@/components/ui/screen";
import { EngagementScreen } from "@/features/self-service/components/engagement-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Polls & surveys" };

/** Workforce › Employee engagement › Polls & surveys (no admin template: template-style screen, Phase 15). */
export default async function Page() {
  const user = await requirePermission("emp:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/engagement">
      <EngagementScreen can={{ create: has("emp:create"), edit: has("emp:edit"), remove: has("emp:delete") }} />
    </Screen>
  );
}
