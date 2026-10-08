import { Screen } from "@/components/ui/screen";
import { FlagDetailScreen } from "@/features/platform-flags/components/flag-detail-screen";

export const metadata = { title: "Flag Detail" };

/** Super Admin › Feature Flags › Flag Detail (template admin/features/view). ?env=DEV|STAGING|PRODUCTION */
export default async function AdminFlagDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ env?: string }> }) {
  const { id } = await params;
  const { env } = await searchParams;
  return (
    <Screen route="admin/features/view" className="ff-screen">
      <FlagDetailScreen key={id} id={id} initialEnv={env} />
    </Screen>
  );
}
