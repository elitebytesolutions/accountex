import { Injectable } from '@nestjs/common';
import { Notifier, type NotificationInput } from '../../core/application/ports/notifier.js';
import { PrismaService } from '../prisma/prisma.service.js';

const args = (n: Omit<NotificationInput, 'userId'>) => [
  n.eventCode, n.category, n.title, n.body ?? null, n.linkRoute ?? null, n.entityType ?? null, n.entityId ?? null, n.amount ?? null,
  n.severity ?? 'INFO', n.needsAction ?? false, n.actorUserId ?? null,
];

/** Company.notify / Company.notifyPermission on the current withContext transaction. */
@Injectable()
export class PrismaNotifier extends Notifier {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async notify(tenantId: string, n: NotificationInput) {
    await this.prisma.db().$queryRawUnsafe(
      'select "Company"."notify"($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::uuid, $10::numeric, $11, $12, $13::uuid)::text as id',
      tenantId, n.userId, ...args(n),
    );
  }

  async notifyPermission(tenantId: string, permission: string, n: Omit<NotificationInput, 'userId'>) {
    await this.prisma.db().$queryRawUnsafe(
      'select "Company"."notifyPermission"($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10::numeric, $11, $12, $13::uuid) as n',
      tenantId, permission, ...args(n),
    );
  }
}
