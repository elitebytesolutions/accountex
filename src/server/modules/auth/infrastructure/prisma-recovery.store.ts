import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { RecoveryStore, type TokenRecord } from '../application/recovery-store.js';

@Injectable()
export class PrismaRecoveryStore extends RecoveryStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lookup(hash: Buffer): Promise<TokenRecord | null> {
    const rows = await this.prisma.db().$queryRawUnsafe<TokenRecord[]>(
      'select "resetId"::text as "resetId", "tenantId"::text as "tenantId", "userId"::text as "userId", purpose, valid, email, "fullName", "companyName", "companyCode" from "Company"."passwordResetLookup"($1::bytea)',
      hash,
    );
    return rows[0] ?? null;
  }

  async consume(hash: Buffer, passwordHash: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<{ id: string }[]>('select "Company"."passwordResetConsume"($1::bytea, $2)::text as id', hash, passwordHash);
    return rows[0]!.id;
  }

  async activeUser(companyCode: string, email: string) {
    const db = this.prisma.db();
    const tenant = await db.tenants.findFirst({ where: { code: companyCode }, select: { id: true } });
    if (!tenant) return null;
    const u = await db.users.findFirst({ where: { tenantId: tenant.id, email: { equals: email, mode: 'insensitive' }, status: 'ACTIVE', deletedAt: null }, select: { id: true, email: true, fullName: true } });
    return u ? { tenantId: tenant.id, userId: u.id, email: u.email, fullName: u.fullName } : null;
  }

  async issueReset(tenantId: string, userId: string, hash: Buffer, expiresAt: Date, ip: string | null) {
    await this.prisma.db().$queryRawUnsafe(
      'select "Company"."passwordResetIssue"($1::uuid, $2::uuid, $3, $4, $5::bytea, $6::timestamptz, NULL::uuid, $7::inet)::text as id',
      tenantId, userId, 'RESET', 'EMAIL', hash, expiresAt, ip,
    );
  }
}
