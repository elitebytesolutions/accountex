import { Screen } from "@/components/ui/screen";
import { OffboardingScreen } from "@/features/hr/components/offboarding-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Offboarding" };

/** Workforce › Talent › Offboarding & Exits (template app/hr/offboarding). */
export default async function OffboardingPage() {
  const user = await requirePermission("emp:view");
  return (
    <Screen route="app/hr/offboarding">
      <OffboardingScreen can={{ edit: user.permissions.includes("emp:edit") }} />
    </Screen>
  );
}
