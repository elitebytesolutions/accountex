import { Module } from '@nestjs/common';
import { HelpdeskTicketStore } from './application/helpdesk-ticket-store.js';
import { HelpdeskTicketsService } from './application/helpdesk-tickets.service.js';
import { PrismaHelpdeskTicketStore } from './infrastructure/prisma-helpdesk-ticket.store.js';
import { HelpdeskTicketsController } from './presentation/helpdesk-tickets.controller.js';

/** Phase 34 self-service requests: helpdesk tickets (HD-) and their message thread. */
@Module({
  controllers: [HelpdeskTicketsController],
  providers: [HelpdeskTicketsService, { provide: HelpdeskTicketStore, useClass: PrismaHelpdeskTicketStore }],
})
export class HelpdeskTicketsModule {}
