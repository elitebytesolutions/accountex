import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { WorkStore } from './common/application/work-store.js';
import { PrismaWorkStore } from './common/infrastructure/prisma-work.store.js';
import { DashboardService } from './dashboard/application/dashboard.service.js';
import { WorkJobsService } from './jobs/application/work-jobs.service.js';
import { NotificationsService } from './notifications/application/notifications.service.js';
import { TasksService } from './tasks/application/tasks.service.js';
import { MyNotificationsController, WorkController } from './tasks/presentation/work.controller.js';

/**
 * Work queue (Phase 44): Today's Work and tasks, the Notification Centre with preferences, the workspace dashboard and
 * the background job for task reminders and due-item notifications. Notifications are written through the global
 * Notifier port (Company.notify), also used by the approval engine and sign-in recovery.
 */
@Module({
  imports: [ApprovalsModule],
  controllers: [WorkController, MyNotificationsController],
  providers: [{ provide: WorkStore, useClass: PrismaWorkStore }, TasksService, NotificationsService, DashboardService, WorkJobsService],
})
export class WorkModule {}
