import { spawn } from 'node:child_process';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { BackupRunner } from '../application/backup-store.js';
import { env } from '../../../../../infrastructure/config/env.js';

// The project root (src/server/... and dist/server/... are both 7 levels below it from this folder).
const ROOT = resolve(import.meta.dirname, '../../../../../../..');

/**
 * Full logical backup with PostgreSQL's pg_dump (custom format, -Fc) into BACKUP_DIR. The password goes in PGPASSWORD,
 * never on the command line.
 */
@Injectable()
export class PgDumpBackupRunner extends BackupRunner {
  private readonly dir = isAbsolute(env.BACKUP_DIR) ? env.BACKUP_DIR : join(ROOT, env.BACKUP_DIR);

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
}
