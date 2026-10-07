import { CoaScreen } from "@/features/finance/components/coa-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Chart of Accounts" };

export default async function CoaPage() {
  const user = await requirePermission("coa:view");
  const has = (p: string) => user.permissions.includes(p);
  return <CoaScreen can={{ create: has("coa:create"), edit: has("coa:edit"), remove: has("coa:delete") }} />;
}
