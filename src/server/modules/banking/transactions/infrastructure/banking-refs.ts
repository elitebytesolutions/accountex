import type { Prisma } from '../../../../generated/prisma/client.js';

/** Small lookups shared by the banking stores: names of bank accounts, vouchers and users, by id. */
export const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const ids = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
export const num = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : 0);

export async function bankAccountRefs(db: Prisma.TransactionClient, tenantId: string, bankAccountIds: (string | null)[]) {
  const rows = await db.bankAccounts.findMany({ where: { tenantId, id: { in: ids(bankAccountIds) } }, select: { id: true, accountTitle: true, accountLast4: true, accountId: true, branchId: true } });
  return new Map(rows.map((r) => [r.id, { id: r.id, title: r.accountTitle, last4: r.accountLast4, accountId: r.accountId, branchId: r.branchId }]));
}

export async function voucherRefs(db: Prisma.TransactionClient, tenantId: string, voucherIds: (string | null)[]) {
  const rows = await db.vouchers.findMany({ where: { tenantId, id: { in: ids(voucherIds) } }, select: { id: true, docNo: true, voucherType: true, status: true } });
  return new Map(rows.map((r) => [r.id, r]));
}

export async function userRefs(db: Prisma.TransactionClient, tenantId: string, userIds: (string | null)[]) {
  const rows = await db.users.findMany({ where: { tenantId, id: { in: ids(userIds) } }, select: { id: true, fullName: true } });
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.fullName }]));
}
