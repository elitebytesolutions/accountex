import { Screen } from "@/components/ui/screen";
import { SubscriptionsScreen } from "@/features/platform-tenants/components/subscriptions-screen";

export const metadata = { title: "Subscriptions" };

/** Super Admin › Billing › Subscriptions (template admin/subscriptions). */
export default function AdminSubscriptionsPage() {
  return (
    <Screen route="admin/subscriptions">
      <SubscriptionsScreen />
    </Screen>
  );
}
