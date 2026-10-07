import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { AuditContext } from '../../core/application/ports/unit-of-work.js';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';
import { env } from '../config/env.js';

/** Session settings read by the DB audit triggers (Company.writeAuditEntry) and row-level security. */
const SETTINGS: [setting: string, key: keyof AuditContext][] = [
  ['app.userId', 'userId'],
  ['app.tenantId', 'tenantId'],
  ['app.correlationId', 'correlationId'],
  ['app.clientIp', 'clientIp'],
  ['app.userAgent', 'userAgent'],
  ['app.sessionId', 'sessionId'],
  ['app.actorLabel', 'actorLabel'],
];

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly transaction = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor() {
    // Sessions run in UTC: @prisma/adapter-pg 7.10 reads timestamptz text and replaces its offset with +00:00, so any
    // other session time zone would shift every timestamp the app reads (e.g. history times).
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, options: '-c TimeZone=UTC' }) });
  }

  /**
   * The current withContext transaction, or the plain client outside one. Repositories always use this.
   * A method, not a getter: PrismaClient is a Proxy that hands getters its raw target (no model delegates).
   */
  db(): Prisma.TransactionClient {
    return this.transaction.getStore() ?? this;
  }

  /**
   * Runs `work` in one transaction whose session settings name the actor, so the audit triggers record
   * who made each change. Settings are transaction-local (set_config(..., true)) and vanish on commit.
   */
  withContext<T>(context: AuditContext, work: () => Promise<T>): Promise<T> {
    if (this.transaction.getStore()) return work(); // already inside one: join it
    return this.$transaction(async (tx) => {
      for (const [setting, key] of SETTINGS) {
        await tx.$executeRaw`select set_config(${setting}, ${context[key] ?? ''}, true)`;
      }
      return this.transaction.run(tx, work);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
