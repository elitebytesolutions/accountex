import type { ListResult, PriceList, PriceListRow, PriceListRowsQuery, QuantityBreak } from '../../../../../shared/index.js';

export type PriceListPage = { search?: string; status?: string; page: number; pageSize: number; sort?: string };
/** What the price lookup needs: the customer's own list and group, each candidate list, prices and slabs. */
export type ResolveInputs = {
  customer: { priceListId: string | null; groupListId: string | null } | null;
  defaultListId: string | null;
  lists: { id: string; code: string; name: string; status: string; validFrom: string | null; validTo: string | null }[];
  productPrice: number;
};

export abstract class PriceListStore {
  abstract page(tenantId: string, q: PriceListPage, today: string): Promise<ListResult<PriceList>>;
  abstract get(tenantId: string, id: string, today: string): Promise<PriceList | null>;
  abstract rows(tenantId: string, listId: string, q: PriceListRowsQuery, date: string): Promise<ListResult<PriceListRow>>;
  /** Every code ever used, deleted lists included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract defaultIds(tenantId: string): Promise<{ id: string; rowVersion: number }[]>;
  abstract activeCurrency(code: string): Promise<boolean>;
  /** Item → price in force on the date (latest effectiveFrom ≤ date). */
  abstract currentPrices(tenantId: string, listId: string, date: string): Promise<Map<string, number>>;
  /** Live products with their purchase cost (for markup pricing). */
  abstract productCosts(tenantId: string): Promise<{ id: string; cost: number }[]>;
  abstract productExists(tenantId: string, itemId: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract upsertItems(data: { priceListId: string; effectiveFrom: string; items: { itemId: string; price: number }[] }): Promise<number>;
  abstract breaks(tenantId: string, listId: string | null, itemId: string): Promise<QuantityBreak[]>;
  /** Products that have slabs for the list (null = for every list). */
  abstract breakItems(tenantId: string, listId: string | null): Promise<{ id: string; sku: string; name: string; slabs: number }[]>;
  abstract replaceBreaks(data: { priceListId: string | null; itemId: string; slabs: { minQty: number; maxQty: number | null; unitPrice: number }[] }): Promise<void>;
  abstract resolveInputs(tenantId: string, customerId: string | undefined, itemId: string): Promise<ResolveInputs | null>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
