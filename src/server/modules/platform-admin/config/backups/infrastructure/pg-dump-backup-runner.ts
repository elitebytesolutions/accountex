import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { BackupRunner } from '../application/backup-store.js';
import { EXPORT_SECRET_COLUMNS } from '../domain/backup-rules.js';
import { env } from '../../../../../infrastructure/config/env.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';

// The project root (src/server/... and dist/server/... are both 7 levels below it from this folder).
const ROOT = resolve(import.meta.dirname, '../../../../../../..');
/** Tables with a tenantId that are platform logs, not the company's data (left out of a tenant export). */
const EXPORT_SKIP = new Set(['Company.AuditTrailEntries', 'Platform.ErrorLogs', 'Platform.PlatformAuditLogs']);
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

/**
 * Full logical backup with PostgreSQL's pg_dump (custom format, -Fc) into BACKUP_DIR. The password goes in PGPASSWORD,
 * never on the command line. Phase 43 adds the TENANT_EXPORT mode: one company's rows as JSON in BACKUP_DIR/exports.
 */
@Injectable()
export class PgDumpBackupRunner extends BackupRunner {
  private readonly dir = isAbsolute(env.BACKUP_DIR) ? env.BACKUP_DIR : join(ROOT, env.BACKUP_DIR);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  locationFor(code: string) {
    return join(this.dir, `${code}.dump`);
  }

  async run(location: string): Promise<{ sizeBytes: number }> {
    await mkdir(this.dir, { recursive: true });
    const url = new URL(env.DATABASE_URL);
    const args = ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-d', url.pathname.replace(/^\//, ''), '-Fc', '--no-password', '-f', location];
    await new Promise<void>((ok, fail) => {
      const child = spawn(env.PG_DUMP_PATH, args, { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }, windowsHide: true });
      let stderr = '';
      child.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-2000); });
      child.on('error', (e) => fail(new Error(`pg_dump could not start (${env.PG_DUMP_PATH}): ${e.message}`)));
      child.on('close', (code) => (code === 0 ? ok() : fail(new Error(`pg_dump exited with code ${code}: ${stderr.trim() || 'no output'}`))));
    }).catch(async (e: unknown) => {
      await unlink(location).catch(() => undefined);
      throw e;
    });
    return { sizeBytes: (await stat(location)).size };
  }

  exportLocationFor(code: string) {
    return join(this.dir, 'exports', `${code}.json`);
  }

  /**
   * One JSON document: { format, version, exportedAt, tenant, tables: { "<Schema>.<Table>": [rows] } } with every table
   * that has a tenantId column (partitions through their parent), secret columns removed.
   */
  async exportTenant(tenantId: string, location: string): Promise<{ sizeBytes: number }> {
    await mkdir(dirname(location), { recursive: true });
    const db = this.prisma;
    const tables = await db.$queryRaw<{ schema: string; table: string }[]>`
      select n.nspname as schema, c.relname as table
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenantId' and not a.attisdropped
       where c.relkind in ('r', 'p') and not c.relispartition and n.nspname not in ('pg_catalog', 'information_schema')
       order by 1, 2`;
    const [tenant] = await db.$queryRaw<{ j: string }[]>`select (to_jsonb(t))::text as j from "Platform"."Tenants" t where t.id = ${tenantId}::uuid`;
    if (!tenant) throw new Error('Company not found');

    const out = createWriteStream(location, { encoding: 'utf8' });
    const write = (s: string) => new Promise<void>((ok, fail) => out.write(s, (e) => (e ? fail(e) : ok())));
    try {
      await write(`{"format":"accountex-tenant-export","version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"tenant":${tenant.j},"tables":{`);
      let first = true;
      for (const t of tables) {
        if (EXPORT_SKIP.has(`${t.schema}.${t.table}`)) continue;
        const [r] = await db.$queryRawUnsafe<{ j: string; n: number }[]>(
          `select coalesce(json_agg(to_jsonb(x) - $2::text[])::text, '[]') as j, count(*)::int as n from ${q(t.schema)}.${q(t.table)} x where x."tenantId" = $1::uuid`,
          tenantId, EXPORT_SECRET_COLUMNS,
        );
        if (!r || r.n === 0) continue;
        await write(`${first ? '' : ','}${JSON.stringify(`${t.schema}.${t.table}`)}:${r.j}`);
        first = false;
      }
      await write('}}');
      await new Promise<void>((ok, fail) => { out.once('error', fail); out.end(() => ok()); });
    } catch (e) {
      out.destroy();
      await unlink(location).catch(() => undefined);
      throw e;
    }
    return { sizeBytes: (await stat(location)).size };
  }
}
