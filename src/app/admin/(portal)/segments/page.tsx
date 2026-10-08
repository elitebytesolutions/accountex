import { Screen } from "@/components/ui/screen";
import { SegmentsScreen } from "@/features/platform-config/components/segments-screen";

export const metadata = { title: "Segments" };

/** Super Admin › Feature Management › Segments (template admin/segments). */
export default function AdminSegmentsPage() {
  return (
    <Screen route="admin/segments" className="ff-screen">
      <SegmentsScreen />
    </Screen>
  );
}
