import { Screen } from "@/components/ui/screen";
import { RoutesScreen } from "@/features/distribution/components/routes-screen";
import "@/features/distribution/distribution.css";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Routes & Salesmen" };

export default async function RoutesPage() {
  const user = await requirePermission("route:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = {
    route: { create: has("route:create"), edit: has("route:edit"), remove: has("route:delete") },
    van: { view: has("van:view"), create: has("van:create"), edit: has("van:edit"), remove: has("van:delete") },
    target: { view: has("target:view"), edit: has("target:edit"), create: has("target:create"), approve: has("target:approve"), post: has("target:post") },
  };
  return (
    <Screen route="app/wholesale/routes" className="ds-screen">
      <RoutesScreen can={can} />
    </Screen>
  );
}
