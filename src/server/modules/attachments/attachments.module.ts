import { Module } from '@nestjs/common';
import { AttachmentStorage } from '../../core/application/ports/attachment-storage.js';
import { LocalAttachmentStorage } from '../../infrastructure/storage/local-attachment.storage.js';
import { AttachmentStore } from './application/attachment-store.js';
import { AttachmentsService } from './application/attachments.service.js';
import { PrismaAttachmentStore } from './infrastructure/prisma-attachment.store.js';
import { AttachmentsController } from './presentation/attachments.controller.js';

/**
 * Minimal attachment upload (Phase 32, extended by Phase 35): files under UPLOAD_DIR, one Company.Attachments row each,
 * type / size limits, permission-checked downloads. Modules import it and register who may read their entity's files.
 */
@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, { provide: AttachmentStore, useClass: PrismaAttachmentStore }, { provide: AttachmentStorage, useClass: LocalAttachmentStorage }],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
