import { Screen } from "@/components/ui/screen";
import { TaxMasterScreen } from "@/features/platform-templates/components/tax-master-screen";

export const metadata = { title: "Tax Master" };

/** Super Admin › Operations › System › Tax Master (template admin/tax-master). */
export default function AdminTaxMasterPage() {
  return (
    <Screen route="admin/tax-master" className="ap-screen">
      <TaxMasterScreen />
    </Screen>
  );
}
