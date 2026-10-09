import { Screen } from "@/components/ui/screen";
import { ActivityScreen } from "@/features/collaboration/components/activity-screen";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Activity" };

/** Workspace › Activity (template app/activity): the company feed, open to every company user. */
export default async function Page() {
  const user = await requireUser();
  return (
    <Screen route="app/activity" className="cp-screen">
      <ActivityScreen userId={user.id} userName={user.name} companyName={user.tenantName} timeZone={user.timeZone} />
    </Screen>
  );
}
