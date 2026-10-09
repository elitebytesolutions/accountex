import { Screen } from "@/components/ui/screen";
import { ChequeRegisterScreen } from "@/features/banking/components/cheque-register-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Cheque Register & PDC" };

export default async function Page() {
  const user = await requirePermission("bank:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/bank/cheque-register">
      <ChequeRegisterScreen can={{ create: has("bank:create"), post: has("bank:post") }} />
    </Screen>
  );
}
