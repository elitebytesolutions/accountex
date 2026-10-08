import { Module } from '@nestjs/common';
import { PlatformAdminModule } from '../platform-admin.module.js';
import { ImpersonationService } from '../tenants/impersonation/application/impersonation.service.js';
import { ImpersonationStore } from '../tenants/impersonation/application/impersonation-store.js';
import { PrismaImpersonationStore } from '../tenants/impersonation/infrastructure/prisma-impersonation.store.js';
import { SubscriptionStore } from '../tenants/subscriptions/application/subscription-store.js';
import { SubscriptionsService } from '../tenants/subscriptions/application/subscriptions.service.js';
import { PrismaSubscriptionStore } from '../tenants/subscriptions/infrastructure/prisma-subscription.store.js';
import { TenantStore } from '../tenants/tenants/application/tenant-store.js';
import { TenantsService } from '../tenants/tenants/application/tenants.service.js';
import { PrismaTenantStore } from '../tenants/tenants/infrastructure/prisma-tenant.store.js';
import { AnnouncementStore } from './announcements/application/announcement-store.js';
import { AnnouncementsService } from './announcements/application/announcements.service.js';
import { PrismaAnnouncementStore } from './announcements/infrastructure/prisma-announcement.store.js';
import { AnnouncementsController } from './announcements/presentation/announcements.controller.js';
import { CommStore } from './comms/application/comm-store.js';
import { CommsService } from './comms/application/comms.service.js';
import { PrismaCommStore } from './comms/infrastructure/prisma-comm.store.js';
import { CommsController } from './comms/presentation/comms.controller.js';
import { LeadStore } from './leads/application/lead-store.js';
import { LeadsService } from './leads/application/leads.service.js';
import { PrismaLeadStore } from './leads/infrastructure/prisma-lead.store.js';
import { LeadsController } from './leads/presentation/leads.controller.js';
import { TicketStore } from './support/application/ticket-store.js';
import { TicketsService } from './support/application/tickets.service.js';
import { PrismaTicketStore } from './support/infrastructure/prisma-ticket.store.js';
import { TicketsController } from './support/presentation/tickets.controller.js';

/**
 * Phase 42: growth & support (/api/admin/{leads,tickets,announcements,broadcasts,comm-logs}). Lead conversion uses the
 * Phase 40 onboarding (TenantsService) and "impersonate from ticket" the Phase 40 support access (ImpersonationService);
 * both are stateless services provided here again with their stores, so the Phase 40 module is left unchanged.
 * Exports the ticket and announcement pieces the workspace side (support-desk) uses.
 */
@Module({
  imports: [PlatformAdminModule],
  controllers: [LeadsController, TicketsController, AnnouncementsController, CommsController],
  providers: [
    LeadsService, { provide: LeadStore, useClass: PrismaLeadStore },
    TicketsService, { provide: TicketStore, useClass: PrismaTicketStore },
    AnnouncementsService, { provide: AnnouncementStore, useClass: PrismaAnnouncementStore },
    CommsService, { provide: CommStore, useClass: PrismaCommStore },
    // Phase 40 services reused (onboarding for lead conversion, support access from a ticket)
    TenantsService, { provide: TenantStore, useClass: PrismaTenantStore },
    SubscriptionsService, { provide: SubscriptionStore, useClass: PrismaSubscriptionStore },
    ImpersonationService, { provide: ImpersonationStore, useClass: PrismaImpersonationStore },
  ],
  exports: [TicketStore, AnnouncementStore, AnnouncementsService],
})
export class PlatformGrowthModule {}
