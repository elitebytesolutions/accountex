import { Screen } from "@/components/ui/screen";
import { BackOrdersScreen } from "@/features/wholesale/components/backorders-screen";
import "@/features/wholesale/components/backorders-screen.css";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Back-orders" };

export default async function BackOrdersPage() {
  const user = await requirePermission("backord:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { edit: has("backord:edit"), approve: has("backord:approve") };
  return (
    <Screen route="app/wholesale/backorders" className="ws2-screen ws2-bo">
      <BackOrdersScreen can={can} />
    </Screen>
  );
}
