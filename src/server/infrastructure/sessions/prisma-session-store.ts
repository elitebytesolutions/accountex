import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SessionStore, type NewSession, type RevokeReason, type SessionRecord } from '../../core/application/ports/session-store.js';
import { PrismaService } from '../prisma/prisma.service.js';

const columns = {
  id: true, tenantId: true, userId: true, deviceLabel: true, clientType: true, ipAddress: true,
  signedInAt: true, lastActiveAt: true, expiresAt: true, revokedAt: true, authMethod: true,
} as const;

@Injectable()
export class PrismaSessionStore extends SessionStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(s: NewSession) {
    const now = new Date();
    await this.prisma.db().userSessions.create({
      data: {
        id: s.id,
        tenantId: s.tenantId,
        userId: s.userId,
        tokenHash: new Uint8Array(createHash('sha256').update(s.token).digest()),
        clientType: 'WEB',
        authMethod: 'PASSWORD',
        deviceLabel: s.deviceLabel,
        userAgent: s.userAgent ?? null,
        ipAddress: s.ipAddress ?? null,
        signedInAt: now,
        lastActiveAt: now,
        expiresAt: s.expiresAt,
      },
    });
  }

  find(id: string): Promise<SessionRecord | null> {
    return this.prisma.db().userSessions.findUnique({ where: { id }, select: columns });
  }

  async touch(id: string) {
    await this.prisma.db().userSessions.updateMany({ where: { id, revokedAt: null }, data: { lastActiveAt: new Date() } });
  }

  listOpen(tenantId: string, userId: string): Promise<SessionRecord[]> {
    return this.prisma.db().userSessions.findMany({
      where: { tenantId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: columns,
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  async revoke(tenantId: string, id: string, reason: RevokeReason, byUserId: string | null) {
    const { count } = await this.prisma.db().userSessions.updateMany({
      where: { tenantId, id, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason, revokedByUserId: byUserId },
    });
    return count === 1;
  }

  async revokeAllForUser(tenantId: string, userId: string, reason: RevokeReason, byUserId: string | null, exceptId?: string) {
    const { count } = await this.prisma.db().userSessions.updateMany({
      where: { tenantId, userId, revokedAt: null, ...(exceptId && { id: { not: exceptId } }) },
      data: { revokedAt: new Date(), revokeReason: reason, revokedByUserId: byUserId },
    });
    return count;
  }
}
