import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-session";

/** A signed-in platform admin skips the admin login page. */
export default async function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentAdmin()) redirect("/admin/dashboard");
  return children;
}
