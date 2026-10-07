import { Screen } from "@/components/ui/screen";
import { DevicesScreen } from "@/features/hr/components/devices-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Biometric Devices" };

export default async function DevicesPage() {
  const user = await requirePermission("att:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/devices">
      {/* There is no att:delete permission; deleting a device needs att:approve. */}
      <DevicesScreen can={{ create: has("att:create"), edit: has("att:edit"), remove: has("att:approve") }} />
    </Screen>
  );
}
