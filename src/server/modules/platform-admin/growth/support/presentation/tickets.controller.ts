import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  TicketActionSchema, TicketAssignSchema, TicketCreateSchema, TicketImpersonateSchema, TicketListQuerySchema, TicketReplySchema, TicketUpdateSchema,
  type AdminSession, type ImpersonationStart, type TicketAction, type TicketActionInput, type TicketAssign, type TicketCreate, type TicketImpersonate,
  type TicketListQuery, type TicketReply, type TicketUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { AUTH_COOKIE } from '../../../../../common/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { env } from '../../../../../infrastructure/config/env.js';
import { TicketsService } from '../application/tickets.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const action = pipe(z.enum(['resolve', 'reopen', 'close']));

/** /api/admin/tickets: Operations › Support › Support Tickets (Phase 42). 409 TICKET_CLOSED on a closed ticket. */
@AdminRoute()
@Controller('admin/tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  board(@Query(pipe(TicketListQuerySchema)) q: TicketListQuery) {
    return this.tickets.board(q);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.tickets.get(id);
  }

  /** The Super Admin logs a ticket for a company (phone, email, chat…). */
  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(TicketCreateSchema)) body: TicketCreate) {
    return this.tickets.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TicketUpdateSchema)) body: TicketUpdate) {
    return this.tickets.update(admin, meta, id, body);
  }

  @Post(':id/messages')
  @HttpCode(200)
  reply(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TicketReplySchema)) body: TicketReply) {
    return this.tickets.reply(admin, meta, id, body);
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TicketAssignSchema)) body: TicketAssign) {
    return this.tickets.assign(admin, meta, id, body);
  }

  /** Support access from the ticket: sets the workspace cookie like POST /admin/tenants/:id/impersonate. Declared before ':id/:action'. */
  @Post(':id/impersonate')
  async impersonate(
    @CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string,
    @Body(pipe(TicketImpersonateSchema)) body: TicketImpersonate, @Res({ passthrough: true }) res: Response,
  ): Promise<ImpersonationStart> {
    const { session, token, expiresAt } = await this.tickets.impersonate(admin, meta, id, body);
    res.cookie(AUTH_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/', expires: expiresAt });
    return { session, openUrl: '/dashboard' };
  }

  @Post(':id/:action')
  @HttpCode(200)
  act(
    @CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string,
    @Param('action', action) act: TicketAction, @Body(pipe(TicketActionSchema)) body: TicketActionInput,
  ) {
    return this.tickets.act(admin, meta, id, act, body);
  }
}
