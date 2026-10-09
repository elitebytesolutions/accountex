import "@/features/self-service/ess.css";
import "@/features/hr/attendance.css";
import "@/features/hr/leave.css";
import "@/features/ess-requests/letter-requests/requests.css";
import { Screen } from "@/components/ui/screen";
import { MyLetterRequestsScreen } from "@/features/ess-requests/letter-requests/components/my-letter-requests-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Letters & Requests" };

/** My Profile › Letters & Requests (template app/profile/requests): request HR letters, track them, download the signed PDF. */
export default async function Page() {
  const user = await requirePermission("myreq:view");
  return (
    <Screen route="app/profile/requests" className="es-screen">
      <MyLetterRequestsScreen can={{ create: user.permissions.includes("myreq:create") }} />
    </Screen>
  );
}
