import { Screen } from "@/components/ui/screen";
import { ImportWizard } from "@/features/data-ops/components/import-wizard";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Data Import" };

export default async function ImportPage() {
  const user = await requirePermission("bak:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/import">
      <ImportWizard
        can={{ create: has("bak:create"), export: has("bak:export"), customers: has("cust:create"), vendors: has("vend:create"), items: has("item:create") }}
      />
    </Screen>
  );
}
