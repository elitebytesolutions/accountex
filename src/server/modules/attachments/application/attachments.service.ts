import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../shared/index.js';
import { actorContext } from '../../../core/application/actor-context.js';
import { AttachmentStorage } from '../../../core/application/ports/attachment-storage.js';
import { UnitOfWork, type RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../core/domain/errors.js';
import { AttachmentStore, type AttachmentRow } from './attachment-store.js';

/** An uploaded file as the HTTP layer hands it over. */
export type UploadedFileData = { originalName: string; mimeType: string; size: number; buffer: Buffer };
export type AttachmentInfo = { id: string; fileName: string; contentType: string; sizeBytes: number; createdAt: string };

/**
 * Who may download a file besides its uploader. Company.Attachments.entityType must be a Company.DocumentTypes code,
 * so records without a document type (e.g. tax declarations) keep the file's id themselves and register a check that
 * recognises their own files by attachment id.
 */
export type AttachmentAccessCheck = (user: SessionUser, attachment: { id: string; entityType: string | null; entityId: string | null }) => Promise<boolean>;

const DEFAULT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const EXT: Record<string, string> = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };
/** The first bytes each allowed type must start with (the declared type alone is not trusted). */
const MAGIC: Record<string, number[][]> = { 'application/pdf': [[0x25, 0x50, 0x44, 0x46]], 'image/png': [[0x89, 0x50, 0x4e, 0x47]], 'image/jpeg': [[0xff, 0xd8, 0xff]] };

/**
 * Minimal attachment upload (Phase 32; Phase 35 extends it): checks type (declared type, extension and file signature)
 * and size, writes the bytes through AttachmentStorage, records a Company.Attachments row in the caller's unit of work,
 * and serves downloads only to the uploader or to users the entity type's access check allows.
 */
@Injectable()
export class AttachmentsService {
  private readonly access = new Map<string, AttachmentAccessCheck>();

  constructor(
    private readonly store: AttachmentStore,
    private readonly storage: AttachmentStorage,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /** Modules register who may read their files (e.g. payroll staff and the employee for tax declaration proofs). */
  registerAccess(name: string, check: AttachmentAccessCheck) {
    this.access.set(name, check);
  }

  /** Validates and stores the bytes, then the row. Call inside the caller's unit of work (`run`), or use `upload`. */
  async save(user: SessionUser, file: UploadedFileData, target: { entityType?: string | null; entityId?: string | null; purpose?: string }, limits: { types?: string[]; maxBytes: number }): Promise<AttachmentInfo> {
    const types = limits.types ?? DEFAULT_TYPES;
    const name = (file.originalName || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 200);
    if (!file.size || !file.buffer?.length) throw new ValidationError('Choose a file to upload', { file: ['The file is empty'] });
    if (file.size > limits.maxBytes) throw new ValidationError(`The file is larger than ${Math.round(limits.maxBytes / 1024 / 1024)} MB`, { file: ['Too large'] }, { code: 'ATTACHMENT_TOO_LARGE' });
    const sig = MAGIC[file.mimeType];
    const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
    const extOk = file.mimeType === 'image/jpeg' ? ['.jpg', '.jpeg'].includes(ext) : ext === EXT[file.mimeType];
    if (!types.includes(file.mimeType) || !extOk || (sig && !sig.some((m) => m.every((b, i) => file.buffer[i] === b)))) {
      throw new ValidationError('This file type is not allowed. Use PDF, JPG or PNG.', { file: ['PDF, JPG or PNG only'] }, { code: 'ATTACHMENT_TYPE_NOT_ALLOWED' });
    }
    const now = new Date();
    const key = `${user.tenantId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${EXT[file.mimeType] ?? ''}`;
    await this.storage.put(key, file.buffer);
    try {
      const id = await this.store.create({
        tenantId: user.tenantId, entityType: target.entityType ?? null, entityId: target.entityId ?? null, purpose: target.purpose ?? 'DOCUMENT', fileName: name,
        contentType: file.mimeType, sizeBytes: file.size, storageKey: key, sha256: createHash('sha256').update(file.buffer).digest(), uploadedByUserId: user.id,
      });
      return { id, fileName: name, contentType: file.mimeType, sizeBytes: file.size, createdAt: now.toISOString() };
    } catch (e) {
      await this.storage.remove(key);
      throw e;
    }
  }

  upload(user: SessionUser, meta: RequestMeta, file: UploadedFileData, target: { entityType?: string | null; entityId?: string | null; purpose?: string }, limits: { types?: string[]; maxBytes: number }) {
    return this.unitOfWork.run(actorContext(user, meta), () => this.save(user, file, target, limits));
  }

  async info(tenantId: string, ids: string[]): Promise<Map<string, AttachmentRow>> {
    return new Map((await this.store.many(tenantId, ids)).map((r) => [r.id, r]));
  }

  async download(user: SessionUser, id: string) {
    const row = await this.store.get(user.tenantId, id);
    if (!row) throw new NotFoundError('File not found');
    let allowed = row.uploadedByUserId === user.id;
    for (const check of this.access.values()) if (!allowed) allowed = await check(user, { id: row.id, entityType: row.entityType, entityId: row.entityId });
    if (!allowed) throw new ForbiddenError('You can’t open this file.', undefined, { code: 'PERMISSION_DENIED' });
    return { fileName: row.fileName, contentType: row.contentType, data: await this.storage.read(row.storageKey) };
  }
}
