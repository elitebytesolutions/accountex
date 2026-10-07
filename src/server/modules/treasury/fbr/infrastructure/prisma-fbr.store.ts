import { Injectable } from '@nestjs/common';
import type { FbrAuthority, FbrSetting } from '../../../../../shared/index.js';
import type { Sealed } from '../../../../core/application/ports/secret-box.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { FbrStore } from '../application/fbr-store.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class PrismaFbrStore extends FbrStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async settings(tenantId: string): Promise<Record<FbrAuthority, FbrSetting | null>> {
    const db = this.prisma.db();
    const rows = await db.fbrSettings.findMany({ where: { tenantId } });
    const maps = rows.length ? await db.fbrBranchMappings.findMany({ where: { tenantId, fbrConfigId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: 'asc' } }) : [];
    const branches = await db.branches.findMany({ where: { tenantId, id: { in: maps.map((m) => m.branchId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const out: Record<string, FbrSetting | null> = { FBR: null, PRA: null };
    for (const r of rows) {
      out[r.authority] = {
        authority: r.authority as FbrAuthority, id: r.id, environment: r.environment, posId: r.posId, ntn: r.ntn, strn: r.strn,
        hasToken: !!r.apiTokenSecretRef, tokenHint: r.apiTokenHint, tokenExpiresOn: day(r.tokenExpiresOn), reportOnPosting: r.reportOnPosting,
        printQr: r.printQr, blockIfUnreachable: r.blockIfUnreachable, syncIntervalMinutes: r.syncIntervalMinutes, connectionStatus: r.connectionStatus,
        lastHealthCheckAt: r.lastHealthCheckAt?.toISOString() ?? null, lastSyncAt: r.lastSyncAt?.toISOString() ?? null, isActive: r.isActive,
        mappings: maps.filter((m) => m.fbrConfigId === r.id).map((m) => ({
          id: m.id, branchId: m.branchId, branchName: m.branchId ? (branches.find((b) => b.id === m.branchId)?.name ?? null) : null, posId: m.posId, isActive: m.isActive,
        })),
        rowVersion: r.rowVersion,
      };
    }
    return out as Record<FbrAuthority, FbrSetting | null>;
  }

  async companyTaxIds(tenantId: string) {
    const s = await this.prisma.db().companySettings.findFirst({ where: { tenantId }, select: { ntn: true, strn: true } });
    return { ntn: s?.ntn ?? null, strn: s?.strn ?? null };
  }

  async activeBranchIds(tenantId: string, ids: string[]) {
    if (!ids.length) return [];
    return (await this.prisma.db().branches.findMany({ where: { tenantId, id: { in: ids }, status: 'ACTIVE', deletedAt: null }, select: { id: true } })).map((b) => b.id);
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'fbrSettingAddUpdate', data);
  }

  async putSecret(tenantId: string, purpose: string, sealed: Sealed) {
    const db = this.prisma.db();
    const row = await db.tenantSecrets.findFirst({ where: { tenantId, purpose }, select: { id: true } });
    const data = { ciphertext: sealed.ciphertext, iv: sealed.iv, authTag: sealed.authTag, keyVersion: sealed.keyVersion };
    if (row) {
      await db.tenantSecrets.update({ where: { id: row.id }, data });
      return row.id;
    }
    return (await db.tenantSecrets.create({ data: { tenantId, purpose, ...data }, select: { id: true } })).id;
  }

  async deleteSecret(tenantId: string, purpose: string) {
    await this.prisma.db().tenantSecrets.deleteMany({ where: { tenantId, purpose } });
  }

  async getSecret(tenantId: string, purpose: string): Promise<Sealed | null> {
    const s = await this.prisma.db().tenantSecrets.findFirst({ where: { tenantId, purpose } });
    return s ? { ciphertext: s.ciphertext, iv: s.iv, authTag: s.authTag, keyVersion: s.keyVersion } : null;
  }
}
