import { Suspense } from "react";
import { Screen } from "@/components/ui/screen";
import { ArReportsScreen } from "@/features/receivables/components/ar-reports-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "AR Ageing & Reports" };

export default async function Page() {
  await requirePermission("rcpt:view");
  return (
    <Screen route="app/receivables/ageing">
      <Suspense>
        <ArReportsScreen />
      </Suspense>
    </Screen>
  );
}
