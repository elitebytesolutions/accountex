import { Screen } from "@/components/ui/screen";
import { CommsScreen } from "@/features/platform-templates/components/comms-screen";

export const metadata = { title: "Communications" };

/** Super Admin › Operations › Support › Communications (template admin/comms). */
export default function AdminCommsPage() {
  return (
    <Screen route="admin/comms" className="ap-screen">
      <CommsScreen />
    </Screen>
  );
}
