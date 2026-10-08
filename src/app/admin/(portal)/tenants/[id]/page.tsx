import { Screen } from "@/components/ui/screen";
import { Tenant360Screen } from "@/features/platform-tenants/components/tenant-360-screen";
import { requireAdmin } from "@/lib/admin-session";

export const metadata = { title: "Tenant 360" };

/** Super Admin › Tenants › Tenant 360 (template admin/tenants/view). ?impersonate=1 opens the impersonation modal. */
export default async function AdminTenant360Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ impersonate?: string }> }) {
  const [{ id }, { impersonate }, admin] = await Promise.all([params, searchParams, requireAdmin()]);
  return (
    <Screen route="admin/tenants/view" className="ap-screen">
      <Tenant360Screen key={id} id={id} staffName={admin.name} openImpersonate={impersonate === "1"} />
    </Screen>
  );
}
