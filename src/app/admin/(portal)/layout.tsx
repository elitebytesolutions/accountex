import Link from "next/link";
import { AdminLogoutButton } from "@/features/admin-auth/components/admin-logout-button";
import { requireAdmin } from "@/lib/admin-session";

export default async function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <Link href="/admin/dashboard" className="font-semibold">
          Accountex <span className="font-normal text-zinc-500">Platform Console</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span>{admin.name}</span>
          <AdminLogoutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
