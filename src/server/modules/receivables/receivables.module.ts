import { Module } from '@nestjs/common';
import { ReminderStore } from './reminders/application/reminder-store.js';
import { RemindersService } from './reminders/application/reminders.service.js';
import { PrismaReminderStore } from './reminders/infrastructure/prisma-reminder.store.js';
import { RemindersController } from './reminders/presentation/reminders.controller.js';

/** Receivables (Phase 9): payment-reminder messages and schedule. */
@Module({
  controllers: [RemindersController],
  providers: [RemindersService, { provide: ReminderStore, useClass: PrismaReminderStore }],
})
export class ReceivablesModule {}
