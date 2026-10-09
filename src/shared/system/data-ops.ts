import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

const rowVersion = z.coerce.number().int().min(0);
type Who = { id: string; name: string } | null;

// ---------------------------------------------------------------- data imports
/** What can be imported, and the columns each import maps (key → label, required). Rows go through the master's own create use case. */
export const IMPORT_ENTITIES = {
  CUSTOMERS: {
    label: 'Customers', permission: 'cust:create', route: '/customers',
    fields: [
      { key: 'name', label: 'Customer name', required: true }, { key: 'code', label: 'Code', required: false }, { key: 'city', label: 'City', required: false },
      { key: 'billingAddress', label: 'Address', required: false }, { key: 'ntn', label: 'NTN', required: false }, { key: 'strn', label: 'STRN', required: false },
      { key: 'cnic', label: 'CNIC', required: false }, { key: 'mobile', label: 'Mobile', required: false }, { key: 'email', label: 'Email', required: false },
      { key: 'creditLimit', label: 'Credit limit', required: false },
    ],
  },
  VENDORS: {
    label: 'Vendors', permission: 'vend:create', route: '/vendors',
    fields: [
      { key: 'name', label: 'Vendor name', required: true }, { key: 'code', label: 'Code', required: false }, { key: 'city', label: 'City', required: false },
      { key: 'address', label: 'Address', required: false }, { key: 'ntn', label: 'NTN', required: false }, { key: 'strn', label: 'STRN', required: false },
      { key: 'mobile', label: 'Mobile', required: false }, { key: 'email', label: 'Email', required: false }, { key: 'atlStatus', label: 'ATL status (ACTIVE / INACTIVE)', required: false },
    ],
  },
  ITEMS: {
    label: 'Items', permission: 'item:create', route: '/inventory/items',
    fields: [
      { key: 'sku', label: 'SKU', required: true }, { key: 'name', label: 'Item name', required: true }, { key: 'unit', label: 'Unit (code)', required: true },
      { key: 'upc', label: 'Barcode', required: false }, { key: 'ctn', label: 'Units per carton', required: false }, { key: 'cost', label: 'Cost price', required: false },
      { key: 'price', label: 'Sale price', required: false }, { key: 'gstRate', label: 'GST %', required: false },
    ],
  },
} as const;
export type ImportEntity = keyof typeof IMPORT_ENTITIES;
export const IMPORT_ENTITY_KEYS = Object.keys(IMPORT_ENTITIES) as ImportEntity[];

/** Column names common in Tally / QuickBooks / Peachtree exports, by field key (normalised: lowercase letters and digits). */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['partyname', 'ledgername', 'customer', 'customername', 'vendor', 'vendorname', 'supplier', 'suppliername', 'displayname', 'companyname', 'itemname', 'stockitem', 'description', 'productname'],
  code: ['partycode', 'customerid', 'vendorid', 'supplierid', 'accountno', 'ledgercode'],
  city: ['town', 'billingcity', 'billtocity'],
  billingAddress: ['address', 'billingaddress', 'billtoaddress', 'billingstreet', 'address1'],
  address: ['billingaddress', 'address1', 'street'],
  ntn: ['ntnno', 'ntnnumber', 'taxid', 'taxregistrationno'],
  strn: ['strnno', 'gstno', 'salestaxno', 'salestaxregistrationno'],
  cnic: ['cnicno', 'nic'],
  mobile: ['phone', 'phoneno', 'mobileno', 'cell', 'cellno', 'contactno', 'telephone'],
  email: ['emailaddress', 'mail'],
  creditLimit: ['creditlimitpkr', 'limit'],
  sku: ['itemcode', 'productcode', 'partno', 'itemno', 'stockcode'],
  unit: ['uom', 'units', 'unitofmeasure', 'baseunit'],
  upc: ['barcode', 'ean'],
  ctn: ['pack', 'packsize', 'cartonqty'],
  cost: ['costprice', 'purchaseprice', 'purchaserate', 'standardcost'],
  price: ['saleprice', 'salesprice', 'rate', 'salerate', 'mrp'],
  gstRate: ['gst', 'taxrate', 'salestax', 'gstrate'],
};

/** Header → field key, by key / label match, then known export aliases; each column maps once (the wizard's Auto-map). */
export function autoMap(entity: ImportEntity, headers: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const out: Record<string, string> = {};
  const used = new Set<string>();
  const take = (key: string, test: (h: string) => boolean) => {
    if (out[key]) return;
    const h = headers.find((x) => !used.has(x) && test(norm(x)));
    if (h) { out[key] = h; used.add(h); }
  };
  const fields = IMPORT_ENTITIES[entity].fields;
  for (const f of fields) take(f.key, (x) => x === norm(f.key) || x === norm(f.label));
  for (const f of fields) take(f.key, (x) => (HEADER_ALIASES[f.key] ?? []).includes(x));
  for (const f of fields) take(f.key, (x) => x.length >= 3 && norm(f.label).startsWith(x));
  return out;
}

/** CSV text → header + rows (quotes, commas and newlines inside quotes). */
export function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  const [headers = [], ...data] = rows;
  return { headers: headers.map((h) => h.trim()), rows: data };
}

export const ImportStartSchema = z.object({
  entity: z.enum(IMPORT_ENTITY_KEYS as [ImportEntity, ...ImportEntity[]]),
  fileName: z.string().trim().min(1).max(200),
  fileSizeBytes: z.coerce.number().int().min(0).max(10 * 1024 * 1024, 'At most 10 MB'),
  sourceSystem: z.enum(['EXCEL', 'TALLY', 'QUICKBOOKS', 'PEACHTREE', 'OTHER']).default('EXCEL'),
  /** field key → file header. */
  columnMap: z.record(z.string(), z.string()),
  totalRows: z.coerce.number().int().min(1, 'The file has no rows').max(20000, 'At most 20,000 rows'),
});
export type ImportStart = z.input<typeof ImportStartSchema>;
/** Mapped rows (field key → text), in file order; row numbers are 1-based data rows. */
export const ImportRowsSchema = z.object({ rows: z.array(z.record(z.string(), z.string().max(2000))).min(1).max(20000) });
export const ImportRunSchema = z.object({ rows: z.array(z.record(z.string(), z.string().max(2000))).min(1).max(20000), skipErrorRows: z.boolean().default(true) });
export type ImportError = { rowNo: number; fieldKey: string | null; badValue: string | null; message: string };
export type DataImport = {
  id: string; jobNo: string; entity: string; fileName: string; fileSizeBytes: number | null; sourceSystem: string | null; totalRows: number; columnMap: Record<string, string>;
  skipErrorRows: boolean; status: string; errorCount: number; rowsCreated: number; rowsUpdated: number; rowsSkipped: number; startedBy: Who; startedAt: string | null;
  finishedAt: string | null; createdAt: string; rowVersion: number; errors?: ImportError[];
};

// ---------------------------------------------------------------- integrations (API keys are Super Admin only: read-only here)
export type IntegrationCard = {
  provider: string; label: string; category: string; status: string; displayName: string; referenceLabel: string | null; connectedAt: string | null; connectedBy: Who;
  lastSyncAt: string | null; lastError: string | null; manageRoute: string | null; rowVersion: number | null;
};
export type IssuedApiKey = { id: string; name: string; environment: string; prefix: string; last4: string; scopes: string[]; createdAt: string; expiresAt: string | null; lastUsedAt: string | null; status: string };
export const TENANT_WEBHOOK_EVENTS = ['invoice.posted', 'invoice.voided', 'payment.received', 'bill.posted', 'payment.made', 'customer.created', 'stock.low'] as const;
export const TenantWebhookInputSchema = z.object({
  url: z.string().trim().url('Enter a URL').max(500).refine((u) => u.startsWith('https://'), 'Use an https:// URL'),
  events: z.array(z.enum(TENANT_WEBHOOK_EVENTS)).min(1, 'Pick at least one event'),
  isActive: z.boolean().default(true),
});
export type TenantWebhookInput = z.input<typeof TenantWebhookInputSchema>;
export const TenantWebhookUpdateSchema = z.intersection(TenantWebhookInputSchema, z.object({ rowVersion }));
export type TenantWebhook = {
  id: string; url: string; events: string[]; isActive: boolean; healthStatus: string; successRatePct: number | null; lastDeliveryAt: string | null; createdAt: string; rowVersion: number;
  /** Only in the create response: the signing secret, shown once. */
  secret?: string;
};
export type TenantWebhookDelivery = { id: string; endpointId: string; event: string; attempt: number; responseStatus: number | null; isSuccess: boolean; error: string | null; durationMs: number | null; deliveredAt: string };
export type IntegrationsOverview = { cards: IntegrationCard[]; apiKeys: IssuedApiKey[]; webhooks: TenantWebhook[] };

// ---------------------------------------------------------------- backups
export const BackupSettingsSchema = z.object({
  frequency: z.enum(['DAILY', 'EVERY_12_HOURS', 'WEEKLY']),
  runAt: z.string().regex(/^\d{2}:\d{2}$/, 'Like 02:00'),
  keepDailyDays: z.coerce.number().int().refine((n) => [14, 35, 90].includes(n), '14, 35 or 90 days'),
  keepMonthlyMonths: z.coerce.number().int().refine((n) => [12, 24].includes(n), '12 or 24 months'),
  includeAttachments: z.boolean().default(true),
  emailOwnerOnFailure: z.boolean().default(true),
});
export type BackupSettingsInput = z.input<typeof BackupSettingsSchema>;
export type BackupSnapshot = {
  id: string; snapshotCode: string; kind: string; note: string | null; startedAt: string; finishedAt: string | null; sizeBytes: number | null; status: string; statusNote: string | null;
  isLocked: boolean; expiresAt: string | null; requestedBy: Who;
};
export type RestoreRequest = {
  id: string; snapshot: { id: string; snapshotCode: string }; reason: string | null; takeSafetyBackup: boolean; safetySnapshotCode: string | null; requestedBy: Who; requestedAt: string;
  status: string; completedAt: string | null; error: string | null; rowVersion: number;
};
export type BackupOverview = {
  settings: { frequency: string; runAt: string; timezone: string; keepDailyDays: number; keepMonthlyMonths: number; includeAttachments: boolean; emailOwnerOnFailure: boolean; nextRunAt: string | null; rowVersion: number | null };
  snapshots: BackupSnapshot[]; restoreRequests: RestoreRequest[]; companyCode: string;
  kpis: { lastBackupAt: string | null; lastStatus: string | null; lastDurationSec: number | null; lastSizeBytes: number | null; retentionDays: number; nextRunAt: string | null };
};
export const RestoreRequestSchema = z.object({
  reason: z.string().trim().min(5, 'Give the reason (at least 5 characters)').max(1000),
  confirmText: z.string().trim().min(1, 'Type the company code'),
  takeSafetyBackup: z.boolean().default(true),
});

// ---------------------------------------------------------------- report runs
export const ReportRunSchema = z.object({ format: z.enum(['CSV']).default('CSV') });
export type ReportRun = {
  id: string; report: { id: string; name: string } | null; title: string; format: string; triggerType: string; status: string; rowCount: number | null; runBy: Who;
  startedAt: string; finishedAt: string | null; errorMessage: string | null; outputAttachmentId: string | null;
};
export const ReportRunQuerySchema = z.object({ report: z.uuid().optional(), mine: z.coerce.boolean().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });

export const OptionalReasonSchema = z.object({ reason: optionalText(500) });
