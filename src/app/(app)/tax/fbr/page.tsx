import { Screen } from "@/components/ui/screen";
import { FbrScreen } from "@/features/treasury/components/fbr-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "FBR Integration" };

export default async function FbrPage() {
  const user = await requirePermission("tax:view");
  return (
    <Screen route="app/tax/fbr">
      <FbrScreen canEdit={user.permissions.includes("tax:edit")} />
    </Screen>
  );
}
