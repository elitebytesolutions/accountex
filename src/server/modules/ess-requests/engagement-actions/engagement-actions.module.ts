import { Module } from '@nestjs/common';
import { EngagementActionsService, RespondentSecret } from './application/engagement-actions.service.js';
import { EngagementActionsStore } from './application/engagement-actions-store.js';
import { EnvRespondentSecret } from './infrastructure/env-respondent-secret.js';
import { PrismaEngagementActionsStore } from './infrastructure/prisma-engagement-actions.store.js';
import { AnnouncementReadsController, MyEngagementActionsController } from './presentation/engagement-actions.controller.js';

/** Phase 34 self-service requests: kudos & reactions, poll votes, pulse answers, announcement reads / RSVP, presence. */
@Module({
  controllers: [MyEngagementActionsController, AnnouncementReadsController],
  providers: [
    EngagementActionsService,
    { provide: EngagementActionsStore, useClass: PrismaEngagementActionsStore },
    { provide: RespondentSecret, useClass: EnvRespondentSecret },
  ],
})
export class EngagementActionsModule {}
