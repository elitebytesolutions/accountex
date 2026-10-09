import { Screen } from "@/components/ui/screen";
import { RecruitmentScreen } from "@/features/hr/components/recruitment-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Recruitment" };

/** Workforce › Talent › Recruitment (template app/hr/recruitment). There are no rec:* permissions: emp:* applies. */
export default async function RecruitmentPage() {
  const user = await requirePermission("emp:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/recruitment">
      <RecruitmentScreen can={{ create: has("emp:create"), edit: has("emp:edit") }} />
    </Screen>
  );
}
