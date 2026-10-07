import { Module } from '@nestjs/common';
import { AnnouncementStore } from './announcements/application/announcement-store.js';
import { AnnouncementsService } from './announcements/application/announcements.service.js';
import { PrismaAnnouncementStore } from './announcements/infrastructure/prisma-announcement.store.js';
import { AnnouncementsController, MyAnnouncementsController } from './announcements/presentation/announcements.controller.js';
import { EngagementSetupService } from './engagement/application/engagement-setup.service.js';
import { EngagementStore } from './engagement/application/engagement-store.js';
import { PrismaEngagementStore } from './engagement/infrastructure/prisma-engagement.store.js';
import { EngagementController, MyEngagementController } from './engagement/presentation/engagement.controller.js';
import { HelpdeskSetupService } from './helpdesk/application/helpdesk-setup.service.js';
import { HelpdeskStore } from './helpdesk/application/helpdesk-store.js';
import { PrismaHelpdeskStore } from './helpdesk/infrastructure/prisma-helpdesk.store.js';
import { HelpdeskController, MyHelpdeskController } from './helpdesk/presentation/helpdesk.controller.js';

/**
 * Employee self-service setup (Phase 15): helpdesk categories & FAQs, company announcements, polls & pulse surveys,
 * plus the read-only employee views of them under /api/me. Tickets, votes, responses and read receipts come in Phase 34.
 */
@Module({
  controllers: [HelpdeskController, MyHelpdeskController, AnnouncementsController, MyAnnouncementsController, EngagementController, MyEngagementController],
  providers: [
    HelpdeskSetupService, { provide: HelpdeskStore, useClass: PrismaHelpdeskStore },
    AnnouncementsService, { provide: AnnouncementStore, useClass: PrismaAnnouncementStore },
    EngagementSetupService, { provide: EngagementStore, useClass: PrismaEngagementStore },
  ],
})
export class SelfServiceModule {}
