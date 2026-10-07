import { AccountSecurity } from "@/features/me/components/account-security";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Account & Security" };

const TABS = ["profile", "security", "prefs"] as const;

/** Every signed-in user may open their own account settings; no permission needed. */
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const initialTab = (TABS as readonly string[]).includes(String(tab)) ? (tab as (typeof TABS)[number]) : "profile";
  return <AccountSecurity initialTab={initialTab} mustChangePassword={user.mustChangePassword} />;
}
