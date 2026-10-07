import type { ListResult, PriceLog, Product, ProductDetail, ProductListQuery } from '../../../../../shared/index.js';

export type ProductSummary = {
  total: number; byStatus: Record<string, number>; companies: number; classes: number; shelves: string[];
  short: number; expiry: number; precious: number; controlled: number;
};
export type ProductChild = 'unit' | 'barcode' | 'supplier';
type Opt = { id: string; name: string };
export type ProductFormOptions = {
  companies: (Opt & { code: string; brandColour: string })[];
  vendors: (Opt & { code: string })[];
  classes: (Opt & { code: string; icon: string; subclasses: Opt[] })[];
  units: (Opt & { code: string; kind: string; decimals: number })[];
  taxCodes: (Opt & { code: string })[];
  warehouses: (Opt & { code: string })[];
};

export abstract class ProductStore {
  abstract page(tenantId: string, q: ProductListQuery): Promise<ListResult<Product>>;
  abstract summary(tenantId: string): Promise<ProductSummary>;
  /** Choices for the product form and its tabs (no Purchases / Tax permission needed). */
  abstract formOptions(tenantId: string): Promise<ProductFormOptions>;
  abstract detail(tenantId: string, id: string): Promise<ProductDetail | null>;
  /** Every SKU ever used, deleted products included (SKUs are never reused). */
  abstract allSkus(tenantId: string): Promise<{ sku: string; deleted: boolean }[]>;
  abstract byBarcode(tenantId: string, barcode: string): Promise<{ itemId: string; kind: string; qtyPerScan: number } | null>;
  abstract priceLog(tenantId: string, itemId: string): Promise<PriceLog[]>;
  /** Active references the product form may point at. */
  abstract activeRef(tenantId: string, kind: 'uom' | 'company' | 'class' | 'vendor' | 'taxCode', id: string): Promise<boolean>;
  abstract subclassOf(tenantId: string, subclassId: string): Promise<string | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract saveChild(kind: ProductChild, data: Record<string, unknown>): Promise<string>;
  abstract addPriceLog(data: Record<string, unknown>): Promise<string>;
  /** The product a unit / barcode / supplier row belongs to, with the row's version. */
  abstract childOwner(tenantId: string, kind: ProductChild, id: string): Promise<{ itemId: string; rowVersion: number } | null>;
  abstract deleteChild(tenantId: string, kind: ProductChild, id: string, rowVersion: number): Promise<void>;
  /** Used by anything other than its own units / barcodes / suppliers / price log. */
  abstract inUse(id: string): Promise<boolean>;
  abstract unitInUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
