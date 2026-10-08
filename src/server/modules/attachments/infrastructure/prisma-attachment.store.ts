import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { AttachmentStore, type AttachmentRow } from '../application/attachment-store.js';

type Row = { id: string; entityType: string | null; entityId: string | null; purpose: string; fileName: string; contentType: string; sizeBytes: bigint; storageKey: string; uploadedByUserId: string | null; createdAt: Date };
const map = (r: Row): AttachmentRow => ({ ...r, sizeBytes: Number(r.sizeBytes), createdAt: r.createdAt.toISOString() });

@Injectable()
export class PrismaAttachmentStore extends AttachmentStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(row: Parameters<AttachmentStore['create']>[0]) {
    const r = await this.prisma.db().attachments.create({ data: { ...row, sizeBytes: BigInt(row.sizeBytes), sha256: new Uint8Array(row.sha256) }, select: { id: true } });
    return r.id;
  }

  async get(tenantId: string, id: string) {
    const r = await this.prisma.db().attachments.findFirst({ where: { tenantId, id, deletedAt: null } });
    return r ? map(r) : null;
  }

  async many(tenantId: string, ids: string[]) {
    if (!ids.length) return [];
    return (await this.prisma.db().attachments.findMany({ where: { tenantId, id: { in: ids }, deletedAt: null } })).map(map);
  }

  async softDelete(tenantId: string, id: string) {
    await this.prisma.db().attachments.updateMany({ where: { tenantId, id }, data: { deletedAt: new Date() } });
  }
}
