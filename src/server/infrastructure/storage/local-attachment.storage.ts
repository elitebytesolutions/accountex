import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AttachmentStorage } from '../../core/application/ports/attachment-storage.js';
import { NotFoundError } from '../../core/domain/errors.js';
import { env } from '../config/env.js';

// The project root (src/server/... and dist/server/... are both 4 levels down).
const ROOT = resolve(import.meta.dirname, '../../../..');

/** Files under UPLOAD_DIR (relative paths are under the project root). Keys never escape the folder. */
@Injectable()
export class LocalAttachmentStorage extends AttachmentStorage {
  private readonly dir = isAbsolute(env.UPLOAD_DIR) ? env.UPLOAD_DIR : join(ROOT, env.UPLOAD_DIR);

  private path(key: string) {
    const p = normalize(join(this.dir, key));
    if (!p.startsWith(normalize(this.dir) + sep)) throw new Error('Invalid storage key');
    return p;
  }

  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data, { flag: 'wx' });
  }

  async read(key: string) {
    try {
      return await readFile(this.path(key));
    } catch {
      throw new NotFoundError('The file is no longer available');
    }
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
}
