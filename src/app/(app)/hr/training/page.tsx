import { Screen } from "@/components/ui/screen";
import { TrainingScreen } from "@/features/hr/components/training-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Training" };

export default async function TrainingPage() {
  // There are no trn:* permissions: training programs use emp:*.
  const user = await requirePermission("emp:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/hr/training">
      <TrainingScreen can={{ create: has("emp:create"), edit: has("emp:edit"), remove: has("emp:delete") }} />
    </Screen>
  );
}
