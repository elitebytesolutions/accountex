import { Module } from '@nestjs/common';
import { PlatformGrowthModule } from '../platform-admin/growth/growth.module.js';
import { MyTicketsService } from './tickets/application/my-tickets.service.js';
import { MyTicketsController } from './tickets/presentation/my-tickets.controller.js';
import { PlatformNoticesService } from './notices/application/platform-notices.service.js';
import { PlatformNoticesController } from './notices/presentation/platform-notices.controller.js';

/**
 * Phase 42, workspace side: "Help & support" tickets (/api/support/tickets) and the platform notices feed behind the
 * workspace banner (/api/me/platform-announcements). Tenant JWT; writes in the user's actor context.
 */
@Module({
  imports: [PlatformGrowthModule],
  controllers: [MyTicketsController, PlatformNoticesController],
  providers: [MyTicketsService, PlatformNoticesService],
})
export class SupportDeskModule {}
