import { Screen } from "@/components/ui/screen";
import { PrincipalClaimsScreen } from "@/features/inventory/components/principal-claims-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Principal Claims & Targets" };

export default async function Page() {
  const user = await requirePermission("item:view");
  return (
    <Screen route="app/inventory/principal-claims">
      <PrincipalClaimsScreen can={{ edit: user.permissions.includes("item:edit") }} />
    </Screen>
  );
}
