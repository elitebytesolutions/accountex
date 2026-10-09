import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { CollaborationStore } from './feed/application/collaboration-store.js';
import { CollaborationService } from './feed/application/collaboration.service.js';
import { PrismaCollaborationStore } from './feed/infrastructure/prisma-collaboration.store.js';
import { CollaborationController } from './feed/presentation/collaboration.controller.js';

/** Data & collaboration — collaboration side (Phase 35): activity feed, comments, mentions, reactions, attachments, tags. */
@Module({
  imports: [AttachmentsModule],
  controllers: [CollaborationController],
  providers: [{ provide: CollaborationStore, useClass: PrismaCollaborationStore }, CollaborationService],
})
export class CollaborationModule {}
