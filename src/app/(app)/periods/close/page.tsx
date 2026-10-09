import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { YearEndScreen } from "@/features/finance/components/year-end-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Year-end Close" };

export default async function YearEndClosePage() {
  const user = await requirePermission("close:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/periods/close" className="yec-scr">
      <Suspense>
        <YearEndScreen can={{ post: has("close:post"), approve: has("close:approve") }} />
      </Suspense>
    </Screen>
  );
}
