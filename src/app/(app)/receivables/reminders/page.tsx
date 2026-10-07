import { Screen } from "@/components/ui/screen";
import { RemindersScreen } from "@/features/receivables/components/reminders-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Payment Reminders" };

export default async function RemindersPage() {
  const user = await requirePermission("rcpt:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/receivables/reminders">
      <div className="cp-screen">
        <RemindersScreen can={{ edit: has("rcpt:edit"), remove: has("rcpt:delete") }} hasCust={has("cust:view")} />
      </div>
    </Screen>
  );
}
