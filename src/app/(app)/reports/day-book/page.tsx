import { Screen } from "@/components/ui/screen";
import { DayBookScreen } from "@/features/ledger/components/day-book-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Day Book" };

export default async function Page() {
  await requirePermission("vch:view");
  return (
    <Screen route="app/reports/day-book">
      <DayBookScreen />
    </Screen>
  );
}
