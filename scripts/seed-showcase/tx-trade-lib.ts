/** Helpers for the trade transaction steps: read-only DB queries (balances), extra API sessions, master lookups. */
import pg from 'pg';
import { Api } from './client.ts';
import type { Ctx } from './ctx.ts';

let client: pg.Client | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Read-only SQL against the showcase company (writes always go through the API). */
export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!client) {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL, options: '-c TimeZone=UTC' });
    await client.connect();
    await client.query('SET default_transaction_read_only = on');
  }
  // One query at a time on the single client (callers run in parallel pools).
  const run = queue.then(() => client!.query(sql, params));
  queue = run.catch(() => undefined);
  return (await run).rows as T[];
}
export async function closeDb() { await client?.end(); client = null; }

/** On-hand per warehouse|item (all batches and bins). */
export async function stockOnHand(tenantId: string): Promise<Map<string, number>> {
  const rows = await q<{ k: string; qty: string }>(
    `select "warehouseId"||'|'||"itemId" as k, sum("qtyOnHand") as qty from "Inventory"."StockBalances" where "tenantId" = $1 group by 1`, [tenantId]);
  return new Map(rows.map((r) => [r.k, Number(r.qty)]));
}

/** Open (posted, unpaid) sales invoices with their balance. */
export async function openInvoices(tenantId: string) {
  return q<{ id: string; customerId: string; branchId: string; docDate: string; dueDate: string; balance: string; net: string }>(
    `select id, "customerId", "branchId", "docDate"::text, "dueDate"::text, "balanceAmount" as balance, "netAmount" as net
       from "Sales"."SalesInvoices" where "tenantId" = $1 and status in ('POSTED','PARTIALLY_PAID') and "balanceAmount" > 0 order by "docDate"`, [tenantId]);
}

/** Open (posted, unpaid) vendor bills with their balance. */
export async function openBills(tenantId: string) {
  return q<{ id: string; vendorId: string; branchId: string; docDate: string; dueDate: string; balance: string }>(
    `select id, "vendorId", "branchId", "docDate"::text, "dueDate"::text, "balanceAmount" as balance
       from "Purchases"."VendorBills" where "tenantId" = $1 and status in ('POSTED','PARTIALLY_PAID') and "balanceAmount" > 0 order by "docDate"`, [tenantId]);
}

/** Batches with stock in a warehouse that expire on or before a date. */
export async function expiringStock(tenantId: string, until: string) {
  return q<{ warehouseId: string; itemId: string; batchId: string; qty: string; expiryDate: string }>(
    `select sb."warehouseId", sb."itemId", sb."batchId", sum(sb."qtyOnHand") as qty, b."expiryDate"::text
       from "Inventory"."StockBalances" sb join "Inventory"."ProductBatches" b on b.id = sb."batchId"
      where sb."tenantId" = $1 and sb."qtyOnHand" > 0 and b."expiryDate" <= $2::date and b.disposition <> 'WRITTEN_OFF'
      group by 1, 2, 3, 5`, [tenantId, until]);
}

/** Extra signed-in admin sessions (the API limits requests per session). */
let sessions: Api[] | null = null;
export async function adminSessions(ctx: Ctx, n: number): Promise<Api[]> {
  if (sessions && sessions[0] === ctx.admin && sessions.length >= n) return sessions;
  const out = [ctx.admin];
  for (let i = 1; i < n; i++) {
    const a = new Api(ctx.admin.base, `admin#${i}`);
    await a.login('/auth/login', { email: process.env.SHOWCASE_USER_EMAIL, password: process.env.SHOWCASE_USER_PASSWORD, companyCode: process.env.SHOWCASE_TENANT_CODE ?? 'showcase' });
    out.push(a);
  }
  sessions = out;
  return out;
}

/** Round-robin over sessions. */
export function rr(apis: Api[]) { let i = 0; return () => apis[i++ % apis.length]; }

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
