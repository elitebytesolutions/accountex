import { Screen } from "@/components/ui/screen";
import { PartnersScreen } from "@/features/platform-catalogue/components/partners-screen";

export const metadata = { title: "Partners & Coupons" };

/** Super Admin › Growth › Partners & Coupons (template admin/partners). Phase 36: the Coupons tab. */
export default async function AdminPartnersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return (
    <Screen route="admin/partners" className="ap-screen">
      <PartnersScreen tab={tab} />
    </Screen>
  );
}
