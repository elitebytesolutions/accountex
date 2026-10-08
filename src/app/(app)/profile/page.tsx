import "@/features/hr/attendance.css";
import { PageHead } from "@/components/ui/page";
import { Screen } from "@/components/ui/screen";
import { MyDayPunchCard, MyDayRest } from "@/features/hr/components/my-day-punch-card";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "My Day" };

/** My Profile › My Day (template app/profile): the punch clock (Phase 30); the other cards arrive with their phases. */
export default async function Page() {
  const user = await requirePermission("myday:view");
  const has = (p: string) => user.permissions.includes(p);
  const first = user.name.split(" ")[0];
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return (
    <Screen route="app/profile" className="fd-screen">
      <PageHead eyebrow={today} title={`Assalam-o-Alaikum, ${first}`} description="Your day at a glance: check in and out here." />
      <div className="fd-grid fd-ess1">
        {has("myatt:view") && <MyDayPunchCard canPunch={has("myatt:create")} />}
        <MyDayRest />
      </div>
    </Screen>
  );
}
