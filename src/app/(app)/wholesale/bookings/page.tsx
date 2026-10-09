import { Screen } from "@/components/ui/screen";
import { BookingsScreen } from "@/features/wholesale/components/bookings-screen";
import "@/features/wholesale/components/bookings-screen.css";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Order Bookings" };

export default async function BookingsPage() {
  const user = await requirePermission("booking:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = { create: has("booking:create"), edit: has("booking:edit"), delete: has("booking:delete"), approve: has("booking:approve") };
  return (
    <Screen route="app/wholesale/bookings" className="ws2-screen ws2-book">
      <BookingsScreen can={can} />
    </Screen>
  );
}
