import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { SessionUser } from '../../../../../shared/index.js';
import {
  TicketAssignSchema, TicketCreateSchema, TicketMessageSchema, TicketQuerySchema, TicketRateSchema, TicketReopenSchema, TicketResolveSchema,
  type TicketAssign, type TicketCreate, type TicketQuery, type TicketRate, type TicketReopen, type TicketResolve,
} from '../../../../../shared/self-service/helpdesk-ticket.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { HelpdeskTicketsService } from '../application/helpdesk-tickets.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/**
 * /api/helpdesk/tickets: My Profile › Helpdesk. Every employee raises and follows their own tickets (myhelp:*);
 * agent actions (assign / resolve) are checked in the service: HR (emp:edit), the desk owner or the assigned agent.
 */
@Controller('helpdesk/tickets')
export class HelpdeskTicketsController {
  constructor(private readonly tickets: HelpdeskTicketsService) {}

  @Get()
  @RequirePermission('myhelp:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(TicketQuerySchema)) q: TicketQuery) {
    return this.tickets.list(user, q);
  }

  @Get('agents')
  @RequirePermission('emp:edit')
  agents(@CurrentUser() user: SessionUser) {
    return this.tickets.agents(user);
  }

  @Get(':id')
  @RequirePermission('myhelp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.tickets.get(user, id);
  }

  @Post()
  @RequirePermission('myhelp:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(TicketCreateSchema)) body: TicketCreate) {
    return this.tickets.create(user, meta, body);
  }

  @Post(':id/messages')
  @HttpCode(200)
  @RequirePermission('myhelp:view')
  message(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TicketMessageSchema)) body: { body: string }) {
    return this.tickets.message(user, meta, id, body.body);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermission('myhelp:view')
  assign(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TicketAssignSchema)) body: TicketAssign) {
    return this.tickets.assign(user, meta, id, body);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @RequirePermission('myhelp:view')
  resolve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TicketResolveSchema)) body: TicketResolve) {
    return this.tickets.resolve(user, meta, id, body);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @RequirePermission('myhelp:create')
  reopen(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TicketReopenSchema)) body: TicketReopen) {
    return this.tickets.reopen(user, meta, id, body);
  }

  @Post(':id/rate')
  @HttpCode(200)
  @RequirePermission('myhelp:create')
  rate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TicketRateSchema)) body: TicketRate) {
    return this.tickets.rate(user, meta, id, body);
  }
}
