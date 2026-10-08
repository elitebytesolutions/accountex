import { Screen } from "@/components/ui/screen";
import { HelpSupportScreen } from "@/features/support/components/help-support-screen";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Help & support" };

/** Workspace › Help & support (Phase 42; from the user menu). Any signed-in user. */
export default async function HelpSupportPage() {
  await requireUser();
  return (
    <Screen route="app/support">
      <HelpSupportScreen />
    </Screen>
  );
}
