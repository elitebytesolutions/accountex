import { Screen } from "@/components/ui/screen";
import { OnboardingScreen } from "@/features/hr/components/onboarding-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage() {
  const user = await requirePermission("emp:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/onboarding">
      <OnboardingScreen can={{ create: has("emp:create"), edit: has("emp:edit"), remove: has("emp:delete") }} />
    </Screen>
  );
}
