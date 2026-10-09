import { Screen } from "@/components/ui/screen";
import { TodayScreen } from "@/features/work/components/today-screen";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Today's Work" };

/** Template app/today: my tasks and everything due today (Phase 44). Every signed-in user. */
export default async function TodayPage() {
  const user = await requireUser();
  return (
    <Screen route="app/today">
      <TodayScreen firstName={user.name.split(" ")[0] ?? user.name} userId={user.id} />
    </Screen>
  );
}
