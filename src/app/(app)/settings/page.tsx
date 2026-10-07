import { SettingsScreen } from "@/features/settings/components/settings-screen";
import { SETTINGS_TABS, type SettingsTab } from "@/features/settings/tabs";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Company Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const user = await requirePermission("comp:view");
  const { tab } = await searchParams;
  const initialTab = (SETTINGS_TABS as readonly string[]).includes(String(tab)) ? (tab as SettingsTab) : "profile";
  return <SettingsScreen initialTab={initialTab} tenantName={user.tenantName} canEdit={user.permissions.includes("comp:edit")} />;
}
