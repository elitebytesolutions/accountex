import { z } from 'zod';
import { ListQuerySchema, patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

export const SCHEME_TYPES = ['FREE_GOODS', 'INVOICE_DISCOUNT', 'BUNDLE_PRICE', 'LINE_DISCOUNT', 'SETTLEMENT', 'SERVICE'] as const;
export type SchemeType = (typeof SCHEME_TYPES)[number];
export const ITEM_ROLES = ['BUY', 'FREE', 'BUNDLE', 'DISCOUNTED'] as const;
export const SCHEME_STATES = ['LIVE', 'SCHEDULED', 'ENDED', 'OFF'] as const;
export type SchemeState = (typeof SCHEME_STATES)[number];

/** A trade scheme (Sales.SalesSchemes) with its products and who it's for. */
export const SchemeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  schemeType: z.string(),
  validFrom: z.string(),
  validTo: z.string(),
  isActive: z.boolean(),
  buyQty: z.number().nullable(),
  freeQty: z.number().nullable(),
  discountPct: z.number().nullable(),
  discountAmount: z.number().nullable(),
  minInvoiceAmount: z.number().nullable(),
  minLineQty: z.number().nullable(),
  bundlePrice: z.number().nullable(),
  settlementDays: z.number().int().nullable(),
  appliesToAll: z.boolean(),
  budgetCap: z.number().nullable(),
  maxUsesPerCustomer: z.number().int().nullable(),
  usedCount: z.number().int(),
  valueGiven: z.number(),
  items: z.array(z.object({ id: z.string(), product: z.object({ id: z.string(), sku: z.string(), name: z.string() }), itemRole: z.string(), qty: z.number().nullable() })),
  eligibility: z.array(z.object({
    id: z.string(), kind: z.enum(['GROUP', 'CUSTOMER', 'TIER']), refId: z.string(), label: z.string(), isExcluded: z.boolean(),
  })),
  rowVersion: z.number().int(),
});
export type Scheme = z.infer<typeof SchemeSchema>;

const pos = (max: number) => z.coerce.number().gt(0, 'More than 0').max(max).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const SchemeFields = {
  name: z.string().trim().min(2, 'Name the scheme').max(120),
  description: optionalText(300),
  schemeType: z.enum(SCHEME_TYPES),
  validFrom: z.iso.date('Use a date'),
  validTo: z.iso.date('Use a date'),
  buyQty: pos(1_000_000),
  freeQty: pos(1_000_000),
  discountPct: pos(100),
  discountAmount: pos(1_000_000_000),
  minInvoiceAmount: z.coerce.number().min(0).max(100_000_000_000).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  minLineQty: pos(1_000_000),
  bundlePrice: z.coerce.number().min(0).max(1_000_000_000).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  settlementDays: z.coerce.number().int().gt(0, 'More than 0').max(365).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  appliesToAll: z.boolean().default(false),
  budgetCap: pos(100_000_000_000),
  maxUsesPerCustomer: z.coerce.number().int().gt(0, 'More than 0').max(100_000).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  items: z.array(z.object({ itemId: z.uuid(), itemRole: z.enum(ITEM_ROLES), qty: pos(1_000_000) })).max(50).default([]),
  eligibility: z.array(z.object({
    customerGroupId: z.uuid().optional().nullable(), customerId: z.uuid().optional().nullable(), priceTier: z.string().trim().max(20).optional().nullable(), isExcluded: z.boolean().default(false),
  })).max(100).default([]),
};

type Terms = {
  schemeType: string; validFrom: string; validTo: string; buyQty?: number | null; freeQty?: number | null; discountPct?: number | null; discountAmount?: number | null;
  minInvoiceAmount?: number | null; bundlePrice?: number | null; settlementDays?: number | null; appliesToAll?: boolean;
  items?: { itemId: string; itemRole: string }[]; eligibility?: { customerGroupId?: string | null; customerId?: string | null; priceTier?: string | null; isExcluded?: boolean }[];
};
/** Field → message for terms that don't fit the scheme type (same rule as the DB check schemeTypeFieldsChk, plus products and audience). */
export function schemeErrors(s: Terms): Record<string, string> {
  const e: Record<string, string> = {};
  const one = (s.discountPct != null ? 1 : 0) + (s.discountAmount != null ? 1 : 0);
  const roles = (r: string) => (s.items ?? []).filter((i) => i.itemRole === r).length;
  switch (s.schemeType) {
    case 'FREE_GOODS':
      if (s.buyQty == null) e.buyQty = 'How many to buy';
      if (s.freeQty == null) e.freeQty = 'How many free';
      if (!roles('BUY')) e.items = 'Add the product(s) to buy';
      break;
    case 'INVOICE_DISCOUNT':
      if (s.minInvoiceAmount == null) e.minInvoiceAmount = 'Invoice value it starts at';
      if (one !== 1) e.discountPct = 'Either a % or an amount off';
      break;
    case 'BUNDLE_PRICE':
      if (s.bundlePrice == null) e.bundlePrice = 'Price of the bundle';
      if (roles('BUNDLE') < 2) e.items = 'A bundle needs at least two products';
      break;
    case 'LINE_DISCOUNT':
      if (one !== 1) e.discountPct = 'Either a % or an amount off';
      if (!roles('DISCOUNTED')) e.items = 'Add the discounted product(s)';
      break;
    case 'SETTLEMENT':
      if (s.settlementDays == null) e.settlementDays = 'Paid within how many days';
      if (s.discountPct == null) e.discountPct = 'Discount % for paying early';
      break;
  }
  if (s.validFrom && s.validTo && s.validTo < s.validFrom) e.validTo = 'Ends before it starts';
  if (!s.appliesToAll && !(s.eligibility ?? []).some((x) => !x.isExcluded)) e.eligibility = 'Choose who it is for, or apply it to all customers';
  if ((s.eligibility ?? []).some((x) => [x.customerGroupId, x.customerId, x.priceTier].filter(Boolean).length !== 1)) e.eligibility = 'Each entry is one group, customer or tier';
  return e;
}

export const SchemeCreateSchema = z.object(SchemeFields).superRefine((s, ctx) => {
  for (const [path, message] of Object.entries(schemeErrors(s))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type SchemeCreate = z.infer<typeof SchemeCreateSchema>;
export const SchemeUpdateSchema = patchFields(SchemeFields).extend(RowVersionSchema.shape);
export type SchemeUpdate = z.infer<typeof SchemeUpdateSchema>;

export const SchemeListQuerySchema = ListQuerySchema.extend({ state: z.enum(SCHEME_STATES).optional(), type: z.enum(SCHEME_TYPES).optional() });
export type SchemeListQuery = z.infer<typeof SchemeListQuerySchema>;
export type SchemeSummary = { live: number; scheduled: number; ended: number; off: number; valueGiven: number };

/** Live / scheduled / ended / off on a date (YYYY-MM-DD). Ended wins over the switch; a switched-off scheme in its window is Off. */
export function schemeState(s: { validFrom: string; validTo: string; isActive: boolean }, today: string): SchemeState {
  if (s.validTo < today) return 'ENDED';
  if (!s.isActive) return 'OFF';
  return s.validFrom > today ? 'SCHEDULED' : 'LIVE';
}

/** Short headline for a scheme card, e.g. "Buy 10 get 1 free" / "5% off over Rs 100,000". */
export function schemeHeadline(s: Pick<Scheme, 'schemeType' | 'buyQty' | 'freeQty' | 'discountPct' | 'discountAmount' | 'minInvoiceAmount' | 'bundlePrice' | 'settlementDays' | 'minLineQty'>): string {
  const n = (v: number | null) => (v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const off = s.discountPct != null ? `${n(s.discountPct)}%` : `Rs ${n(s.discountAmount)}`;
  switch (s.schemeType) {
    case 'FREE_GOODS': return `Buy ${n(s.buyQty)} get ${n(s.freeQty)} free`;
    case 'INVOICE_DISCOUNT': return `${off} off over Rs ${n(s.minInvoiceAmount)}`;
    case 'BUNDLE_PRICE': return `Bundle for Rs ${n(s.bundlePrice)}`;
    case 'LINE_DISCOUNT': return `${off} off${s.minLineQty ? `, min ${n(s.minLineQty)}` : ''}`;
    case 'SETTLEMENT': return `${n(s.discountPct)}% if paid within ${n(s.settlementDays)} days`;
    default: return 'Service scheme';
  }
}
