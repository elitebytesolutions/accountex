import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  MyTicketReplySchema, TicketCsatSchema, TicketRaiseSchema,
  type MyTicketReply, type SessionUser, type TicketCsat, type TicketRaise,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { MyTicketsService } from '../application/my-tickets.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/support/tickets: the company's "Help & support" (Phase 42). Any signed-in user; no permission code needed. */
@Controller('support/tickets')
export class MyTicketsController {
  constructor(private readonly tickets: MyTicketsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.tickets.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.tickets.get(user, id);
  }

  @Post()
  raise(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(TicketRaiseSchema)) body: TicketRaise) {
    return this.tickets.raise(user, meta, body);
  }

  @Post(':id/messages')
  @HttpCode(200)
  reply(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(MyTicketReplySchema)) body: MyTicketReply) {
    return this.tickets.reply(user, meta, id, body);
  }

  @Post(':id/csat')
  @HttpCode(200)
  csat(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TicketCsatSchema)) body: TicketCsat) {
    return this.tickets.rate(user, meta, id, body);
  }
}
