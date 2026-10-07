import { Screen } from "@/components/ui/screen";
import { LabelsScreen } from "@/features/inventory/components/labels-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Barcode Labels" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LabelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ids } = await searchParams;
  const user = await requirePermission("item:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("item:create"), edit: has("item:edit"), remove: has("item:delete") };
  const initialIds = [...new Set(String(ids ?? "").split(",").filter((x) => UUID.test(x)))];
  return (
    <Screen route="app/inventory/labels" className="pr-screen pr-lb">
      <LabelsScreen can={can} initialIds={initialIds} />
    </Screen>
  );
}
