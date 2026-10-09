import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CashEntrySchema, CashReverseSchema, type CashEntryInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { CashBookService } from '../application/cash-book.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const Period = z.object({ account: z.uuid().optional(), from: z.iso.date(), to: z.iso.date() });
const LedgerQ = z.object({ account: z.uuid('Choose the cash account'), from: z.iso.date(), to: z.iso.date() });

/** /api/cash/options, /api/cash/book, /api/cash/entries, /api/cash/ledger: Finance › Cash › Cash Book and Cash Ledger. */
@Controller('cash')
export class CashBookController {
  constructor(private readonly book: CashBookService) {}

  @Get('options')
  @RequirePermission('cash:view')
  options(@CurrentUser() user: SessionUser) {
    return this.book.options(user);
  }

  @Get('book')
  @RequirePermission('cash:view')
  cashBook(@CurrentUser() user: SessionUser, @Query(pipe(Period)) q: z.infer<typeof Period>) {
    return this.book.book(user, q);
  }

  @Get('ledger')
  @RequirePermission('cash:view')
  ledger(@CurrentUser() user: SessionUser, @Query(pipe(LedgerQ)) q: z.infer<typeof LedgerQ>) {
    return this.book.ledger(user, q);
  }

  @Post('entries')
  @RequirePermission('cash:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(CashEntrySchema)) body: CashEntryInput) {
    return this.book.create(user, meta, body);
  }

  @Post('entries/:id/reverse')
  @HttpCode(200)
  @RequirePermission('cash:post')
  reverse(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CashReverseSchema)) body: z.infer<typeof CashReverseSchema>) {
    return this.book.reverse(user, meta, id, { ...body, remarks: body.remarks ?? null });
  }
}
