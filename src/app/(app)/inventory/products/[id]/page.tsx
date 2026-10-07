import { Screen } from "@/components/ui/screen";
import { ProductDetailScreen } from "@/features/inventory/components/product-detail-screen";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Product Detail" };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("item:view");
  const has = (p: string) => user.permissions.includes(p);
  return (
    <Screen route="app/inventory/products/view" className="pr-screen pr-pd">
      <ProductDetailScreen id={id} can={{ create: has("item:create"), edit: has("item:edit"), remove: has("item:delete") }} />
    </Screen>
  );
}
