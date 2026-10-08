import "@/features/self-service/ess.css";
import "@/features/hr/attendance.css";
import "@/features/hr/leave.css";
import { Screen } from "@/components/ui/screen";
import { MyOnboardingScreen } from "@/features/hr/components/my-onboarding-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Onboarding & Policies" };

/** My Profile › Onboarding & Policies (template app/profile/onboarding): the own onboarding checklist. */
export default async function Page() {
  const user = await requirePermission("myonb:view");
  return (
    <Screen route="app/profile/onboarding" className="es-screen">
      <MyOnboardingScreen can={{ edit: user.permissions.includes("myonb:edit") }} />
    </Screen>
  );
}
