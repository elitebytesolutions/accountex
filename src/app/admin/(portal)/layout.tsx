import { AdminShell } from "@/features/shell/components/admin-shell";
import { requireAdmin } from "@/lib/admin-session";

export default async function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
