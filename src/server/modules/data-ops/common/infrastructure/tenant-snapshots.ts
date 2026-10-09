import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { env } from '../../../../infrastructure/config/env.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { PgDumpBackupRunner } from '../../../platform-admin/config/backups/infrastructure/pg-dump-backup-runner.js';
import { TenantSnapshots, WebhookSender } from '../application/data-ops-store.js';

const root = () => (isAbsolute(env.BACKUP_DIR) ? env.BACKUP_DIR : resolve(process.cwd(), env.BACKUP_DIR));

/**
 * Tenant backups reuse the Super Admin tenant-export runner (Phase 43): one JSON document of every tenant table, secret
 * columns removed. Files live under BACKUP_DIR/tenants/<tenantId>/<snapshot>.json; no full-database dump per company.
 */
@Injectable()
export class RunnerTenantSnapshots extends TenantSnapshots {
  private readonly runner: PgDumpBackupRunner;

  constructor(prisma: PrismaService) {
    super();
    this.runner = new PgDumpBackupRunner(prisma);
  }

  locationFor(tenantId: string, snapshotCode: string) {
    return join(root(), 'tenants', tenantId, `${snapshotCode}.json`);
  }

  export(tenantId: string, location: string) {
    return this.runner.exportTenant(tenantId, location);
  }

  read(location: string) {
    return readFile(location);
  }
}

/** Signed webhook delivery: `x-accountex-signature: t=<unix>,v1=<hmac-sha256 of "<t>.<body>">`, 10 s timeout, no redirects. */
@Injectable()
export class FetchWebhookSender extends WebhookSender {
  async send(url: string, secret: string, event: string, payload: unknown) {
    const body = JSON.stringify(payload);
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000), body,
        headers: { 'content-type': 'application/json', 'x-accountex-event': event, 'x-accountex-signature': `t=${t},v1=${sig}` },
      });
      return { status: res.status, ok: res.status >= 200 && res.status < 300, error: res.status >= 300 ? `HTTP ${res.status}` : null, durationMs: Date.now() - started };
    } catch (e) {
      return { status: null, ok: false, error: e instanceof Error ? e.message.slice(0, 300) : 'Request failed', durationMs: Date.now() - started };
    }
  }
}
