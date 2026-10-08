import { Screen } from "@/components/ui/screen";
import { ChangeRequestsScreen } from "@/features/platform-ops/components/change-requests-screen";

export const metadata = { title: "Change Requests" };

/** Super Admin › Billing › Feature Management › Change Requests (template admin/change-requests, Phase 43). */
export default async function AdminChangeRequestsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  return (
    <Screen route="admin/change-requests" className="ff-screen">
      <ChangeRequestsScreen key={open ?? "list"} initialOpen={open} />
    </Screen>
  );
}
