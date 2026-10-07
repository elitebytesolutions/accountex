import { TemplatesScreen } from "@/features/access/components/templates-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Document Templates" };

export default async function TemplatesPage() {
  const user = await requirePermission("comp:view");
  return <TemplatesScreen canEdit={user.permissions.includes("comp:edit")} />;
}
