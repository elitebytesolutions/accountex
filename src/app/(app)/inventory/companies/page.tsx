import { Screen } from "@/components/ui/screen";
import { CompaniesScreen } from "@/features/inventory/components/companies-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Companies & Brands" };

export default async function CompaniesPage() {
  const user = await requirePermission("item:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("item:create"), edit: has("item:edit"), remove: has("item:delete") };
  return (
    <Screen route="app/inventory/companies" className="pr-screen pr-co">
      <CompaniesScreen can={can} />
    </Screen>
  );
}
