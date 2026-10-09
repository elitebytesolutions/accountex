import { baseQtyOf, lineAmounts, type SalesInvoiceInput, type WholesaleOptions } from '../../../../../shared/index.js';
import { DomainError } from '../../../../core/domain/errors.js';

export type WsLine = { itemId: string; qtyCtn: number; qtyLoose: number; bonusQty?: number; rate: number; discountPct?: number; taxRate: number; batchId?: string | null };
export type WsHeader = {
  customerId: string; docDate: string; warehouseId: string; branchId?: string | null; routeId?: string | null; salesmanEmployeeId?: string | null;
  bookerEmployeeId?: string | null; priceTier: string; remarks?: string | null;
};

/** The shop's tier factor (1 when the tier is unknown). */
export const tierFactor = (o: WholesaleOptions, tier: string) => o.tiers.find((t) => t.code === tier)?.rateFactor ?? 1;

/** A WHOLESALE sales invoice for the Phase 23 invoice service (WS number, credit control and stock issue at posting). */
export function wholesaleInvoice(o: WholesaleOptions, h: WsHeader, lines: WsLine[]): SalesInvoiceInput {
  const shop = o.shops.find((s) => s.customerId === h.customerId);
  const route = o.routes.find((r) => r.id === (h.routeId ?? shop?.routeId));
  const factor = Math.min(1, tierFactor(o, h.priceTier));
  return {
    channel: 'WHOLESALE', customerId: h.customerId, docDate: h.docDate, branchId: h.branchId ?? route?.branchId ?? o.branches[0]?.id ?? '', warehouseId: h.warehouseId,
    paymentTerms: shop?.paymentTerms ?? 'NET_30', saleType: 'WHOLESALE', submitToFbr: true, remarks: h.remarks ?? null,
    priceTier: h.priceTier, priceTierFactor: factor > 0 ? factor : 1, routeId: route?.id ?? null,
    salesmanEmployeeId: h.salesmanEmployeeId ?? null, bookerEmployeeId: h.bookerEmployeeId ?? null,
    salesmanName: o.employees.find((e) => e.id === h.salesmanEmployeeId)?.name ?? route?.salesman?.name ?? null,
    bookerName: o.employees.find((e) => e.id === h.bookerEmployeeId)?.name ?? route?.booker?.name ?? null,
    lines: lines.map((l) => {
      const p = o.products.find((x) => x.id === l.itemId);
      return {
        itemId: l.itemId, qtyCtn: l.qtyCtn, qtyLoose: l.qtyLoose, bonusQty: l.bonusQty ?? 0, rate: l.rate, discountPct: l.discountPct ?? 0,
        taxCodeId: p?.taxCodeId ?? null, taxRate: l.taxRate, batchId: l.batchId ?? null,
      };
    }),
  };
}

/** Pieces, gross, discount, tax, net of a wholesale line (rate per piece). */
export function wsAmounts(o: WholesaleOptions, l: WsLine) {
  const p = o.products.find((x) => x.id === l.itemId);
  const ctn = p?.ctn ?? 1;
  const baseQty = baseQtyOf(l.qtyCtn, l.qtyLoose, ctn);
  const a = lineAmounts({ baseQty, rate: l.rate, discountPct: l.discountPct ?? 0, taxRate: l.taxRate });
  return { ctn, baseQty, grossAmount: a.grossAmount, discountAmount: a.discountAmount, taxAmount: a.taxAmount, netAmount: a.totalAmount };
}

/** Catalogue code and message of an error (a DomainError, or a database HINT). */
export function errorInfo(e: unknown): { code: string | null; message: string } {
  if (e instanceof DomainError) return { code: e.code, message: e.message };
  const cause = (e as { meta?: { driverAdapterError?: { cause?: { hint?: string; originalMessage?: string } } } })?.meta?.driverAdapterError?.cause;
  return { code: cause?.hint ?? null, message: cause?.originalMessage ?? (e instanceof Error ? e.message : String(e)) };
}
