import { Module } from '@nestjs/common';
import { EngagementActionsModule } from './engagement-actions/engagement-actions.module.js';
import { HelpdeskTicketsModule } from './helpdesk-tickets/helpdesk-tickets.module.js';
import { MyTeamModule } from './my-team/my-team.module.js';
import { LetterRequestsModule } from './letter-requests/letter-requests.module.js';
import { PolicyAcksModule } from './policy-acks/policy-acks.module.js';
import { ProfileChangesModule } from './profile-changes/profile-changes.module.js';

/**
 * Employee self-service requests (Phase 34), raised from My Profile and handled by HR / line managers:
 * letter requests, profile change requests, helpdesk tickets, kudos / votes / pulse answers / announcement reads /
 * presence, and policy acknowledgements. Setup (categories, polls, surveys, policies) lives in Phases 13 and 15.
 */
@Module({
  imports: [LetterRequestsModule, ProfileChangesModule, HelpdeskTicketsModule, EngagementActionsModule, PolicyAcksModule, MyTeamModule],
})
export class EssRequestsModule {}
