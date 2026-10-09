import { Screen } from "@/components/ui/screen";
import { QuickEntryScreen } from "@/features/wholesale/components/quick-entry-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Quick Wholesale Entry" };

export default async function QuickEntryPage() {
  const user = await requirePermission("wsentry:view");
  const has = (p: string) => user.permissions.includes(p);
  const can = {
    save: has("wsentry:create"),
    hold: has("wsentry:create"),
    discard: has("wsentry:delete"),
    templates: has("booking:create") || has("wsentry:create"),
  };
  return (
    <Screen route="app/wholesale/entry" className="ws2-screen ws2-entry">
      <QuickEntryScreen can={can} />
    </Screen>
  );
}
