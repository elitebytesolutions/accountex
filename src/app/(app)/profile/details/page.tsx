import "@/features/self-service/ess.css";
import "@/features/hr/attendance.css";
import { Screen } from "@/components/ui/screen";
import { PersonalDetailsScreen } from "@/features/ess-requests/profile-changes/components/personal-details-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "My Profile" };

/** My Profile › Personal details (template app/profile/details): own record; changes go to HR as profile change requests (Phase 34). */
export default async function Page() {
  const user = await requirePermission("myprof:view");
  return (
    <Screen route="app/profile/details" className="es-screen">
      <PersonalDetailsScreen canEdit={user.permissions.includes("myprof:edit")} />
    </Screen>
  );
}
