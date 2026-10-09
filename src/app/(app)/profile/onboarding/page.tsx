import "@/features/self-service/ess.css";
import "@/features/hr/attendance.css";
import "@/features/hr/leave.css";
import { Screen } from "@/components/ui/screen";
import { MyPoliciesCard } from "@/features/ess-requests/policy-acks/components/my-policies";
import { MyOnboardingScreen } from "@/features/hr/components/my-onboarding-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Onboarding & Policies" };

/** My Profile › Onboarding & Policies (template app/profile/onboarding): the own onboarding checklist and the company policies to read and sign (Phase 34). */
export default async function Page() {
  const user = await requirePermission("myonb:view");
  const can = { edit: user.permissions.includes("myonb:edit") };
  return (
    <Screen route="app/profile/onboarding" className="es-screen">
      <MyOnboardingScreen can={can} />
      <MyPoliciesCard can={can} />
    </Screen>
  );
}
