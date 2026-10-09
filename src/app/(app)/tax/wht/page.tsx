import { Screen } from "@/components/ui/screen";
import { WhtScreen } from "@/features/tax/components/wht-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Withholding Tax" };

export default async function WhtPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await searchParams;
  const user = await requirePermission("tax:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/tax/wht">
      <WhtScreen initialPeriod={/^\d{4}-\d{2}$/.test(period ?? "") ? `${period}-01` : null} can={{ create: has("tax:create"), edit: has("tax:edit"), approve: has("tax:approve"), post: has("tax:post"), export: has("tax:export") }} />
    </Screen>
  );
}
