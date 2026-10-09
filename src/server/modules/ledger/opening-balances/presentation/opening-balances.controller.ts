import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { OpeningSchema, RowVersionSchema, type OpeningInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { OpeningBalancesService } from '../application/opening-balances.service.js';

/** /api/accounting/opening-balances: Finance › Accounts › Opening Balances. */
@Controller('accounting/opening-balances')
export class OpeningBalancesController {
  constructor(private readonly opening: OpeningBalancesService) {}

  @Get()
  @RequirePermission('vch:view')
  get(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(z.object({ year: z.uuid() }))) q: { year: string }) {
    return this.opening.get(user, q.year);
  }

  @Put()
  @RequirePermission('vch:edit')
  save(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(OpeningSchema)) body: OpeningInput) {
    return this.opening.save(user, meta, body);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('vch:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.opening.post(user, meta, id, body.rowVersion);
  }
}
