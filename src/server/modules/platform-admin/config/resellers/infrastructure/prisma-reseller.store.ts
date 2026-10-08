import { Injectable } from '@nestjs/common';
import type { Reseller } from '../../../../../../shared/index.js';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../../infrastructure/prisma/references.js';
import { ResellerStore } from '../application/reseller-store.js';

/** Every column except the sealed IBAN (ibanEnc), which never leaves the database through this store. */
const select = {
  id: true, name: true, city: true, tier: true, commissionPct: true, nextTierTenants: true, contactName: true, email: true, phone: true, ntn: true,
  isActiveTaxpayer: true, payoutMethod: true, bankName: true, ibanMasked: true, inviteCode: true, status: true, updatedAt: true, rowVersion: true,
} as const satisfies Prisma.ResellersSelect;
type Row = Prisma.ResellersGetPayload<{ select: typeof select }>;

@Injectable()
export class PrismaResellerStore extends ResellerStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    return this.map(await this.prisma.db().resellers.findMany({ where: { deletedAt: null }, select, orderBy: [{ name: 'asc' }] }));
  }

  async get(id: string) {
    const row = await this.prisma.db().resellers.findFirst({ where: { id, deletedAt: null }, select });
    return row ? (await this.map([row]))[0]! : null;
  }

  async allNames() {
    const rows = await this.prisma.db().resellers.findMany({ select: { id: true, name: true, deletedAt: true } });
    return rows.map((r) => ({ id: r.id, name: r.name, deleted: r.deletedAt !== null }));
  }

  async inviteCodeTaken(code: string) {
    return (await this.prisma.db().resellers.count({ where: { inviteCode: code } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'resellerAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'resellers', id);
  }

  async softDelete(id: string, rowVersion: number) {
    const { count } = await this.prisma.db().resellers.updateMany({ where: { id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this reseller. Reload and try again.');
  }

  private async map(rows: Row[]): Promise<Reseller[]> {
    if (!rows.length) return [];
    // Platform.ResellerTenants is written by billing (Phase 41): counted with SQL (current attributions only).
    const counts = await this.prisma.db().$queryRaw<{ id: string; n: bigint }[]>`
      select "partnerId"::text as id, count(*) as n from "Platform"."ResellerTenants"
       where "partnerId" = any(${rows.map((r) => r.id)}::uuid[]) and ("endedOn" is null or "endedOn" > current_date) group by "partnerId"`;
    const n = new Map(counts.map((c) => [c.id, Number(c.n)]));
    return rows.map((r) => ({
      ...r, commissionPct: r.commissionPct.toNumber(), email: r.email, tenantsCount: n.get(r.id) ?? 0, updatedAt: r.updatedAt.toISOString(),
    }));
  }
}
