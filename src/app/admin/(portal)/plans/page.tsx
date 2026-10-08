import { Screen } from "@/components/ui/screen";
import { PlansScreen } from "@/features/platform-catalogue/components/plans-screen";

export const metadata = { title: "Plans & Pricing" };

/** Super Admin › Billing › Plans & Billing › Plans & Pricing (template admin/plans). */
export default async function AdminPlansPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: openNew } = await searchParams;
  return (
    <Screen route="admin/plans">
      <PlansScreen key={openNew ?? "list"} openNew={openNew === "1"} />
    </Screen>
  );
}
