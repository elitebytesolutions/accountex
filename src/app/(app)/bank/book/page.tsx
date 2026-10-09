import { Screen } from "@/components/ui/screen";
import { BankBookScreen } from "@/features/banking/components/bank-book-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Bank Book" };

export default async function Page() {
  await requirePermission("bank:view");
  return (
    <Screen route="app/bank/book">
      <BankBookScreen />
    </Screen>
  );
}
