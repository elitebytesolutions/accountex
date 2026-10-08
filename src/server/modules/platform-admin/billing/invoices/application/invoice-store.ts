import type { InvoiceChip, InvoiceKpis, InvoiceListQuery, PlatformInvoice, PlatformInvoiceDetail } from '../../../../../../shared/index.js';

/** A live paid subscription whose current period has no invoice yet (what the daily job bills). */
export type DueSubscription = { subscriptionId: string; tenantId: string; tenantName: string; periodStart: string };

/** Port: Platform.PlatformInvoices + lines (writes through platformInvoiceAddUpdate / Issue / Void / Generate). */
export abstract class InvoiceStore {
  abstract list(q: InvoiceListQuery, today: string): Promise<{ items: PlatformInvoice[]; total: number; counts: Record<InvoiceChip, number> }>;
  /** getPlatformBillingByMonth for one month (YYYY-MM). */
  abstract kpis(month: string): Promise<InvoiceKpis>;
  /** Months (YYYY-MM, newest first) that have issued invoices. */
  abstract months(): Promise<string[]>;
  abstract get(id: string, today: string): Promise<PlatformInvoice | null>;
  /** The invoice with its lines, bill-to facts and dunning case (payments are added by the service). */
  abstract detail(id: string, today: string): Promise<Omit<PlatformInvoiceDetail, 'payments'> | null>;
  abstract tenantExists(tenantId: string): Promise<boolean>;
  /** The company's provincial sales-tax authority and its ACTIVE rate on `onDate` (rate 0 without one). */
  abstract tenantTax(tenantId: string, onDate: string): Promise<{ authorityId: string | null; rate: number }>;
  /** The current period start of the company's live paid subscription, or null. */
  abstract subscriptionPeriod(tenantId: string): Promise<string | null>;
  abstract couponByCode(code: string): Promise<string | null>;
  abstract dueSubscriptions(today: string): Promise<DueSubscription[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Platform.platformInvoiceIssue: the FS-INV number. */
  abstract issue(id: string): Promise<string>;
  abstract voidInvoice(id: string, reason: string): Promise<void>;
  /** Platform.platformInvoiceGenerate: the DRAFT (or the existing invoice of that period). */
  abstract generate(tenantId: string, periodStart: string, couponId: string | null): Promise<string>;
}
