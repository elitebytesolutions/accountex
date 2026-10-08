import { requireAdmin } from "@/lib/admin-session";

/** Phase 41: Super Admin print views (invoice PDF, partner statement): signed-in admin, no portal shell. */
export default async function AdminPrintLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div style={{ minHeight: "100vh", background: "var(--bg)" }}>{children}</div>;
}
