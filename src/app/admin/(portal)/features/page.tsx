import { Screen } from "@/components/ui/screen";
import { FeaturesScreen } from "@/features/platform-flags/components/features-screen";

export const metadata = { title: "Feature Flags" };

/** Super Admin › Billing › Feature Management › Feature Flags (template admin/features). */
export default async function AdminFeaturesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: openNew } = await searchParams;
  return (
    <Screen route="admin/features" className="ff-screen">
      <FeaturesScreen key={openNew ?? "list"} openNew={openNew === "1"} />
    </Screen>
  );
}
