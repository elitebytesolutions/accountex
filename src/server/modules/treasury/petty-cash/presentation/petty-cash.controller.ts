import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  PettyCashFundCreateSchema,
  PettyCashFundUpdateSchema,
  RowVersionSchema,
  type PettyCashFundCreate,
  type PettyCashFundUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PettyCashService } from '../application/petty-cash.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/cash/petty-funds: Cash › Petty Cash (funds). */
@Controller('cash/petty-funds')
export class PettyCashController {
  constructor(private readonly funds: PettyCashService) {}

  @Get()
  @RequirePermission('cash:view')
  list(@CurrentUser() user: SessionUser) {
    return this.funds.list(user);
  }

  /** Custodian choices (active users' names) for people who manage cash but can't read the user list. */
  @Get('custodians')
  @RequirePermission('cash:view')
  custodians(@CurrentUser() user: SessionUser) {
    return this.funds.custodians(user);
  }

  @Post()
  @RequirePermission('cash:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(PettyCashFundCreateSchema)) body: PettyCashFundCreate) {
    return this.funds.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('cash:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(PettyCashFundUpdateSchema)) body: PettyCashFundUpdate) {
    return this.funds.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('cash:edit')
  setClosed(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['close', 'reopen']))) action: 'close' | 'reopen', @Body(version) body: { rowVersion: number }) {
    return this.funds.setClosed(user, meta, id, action === 'close', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('cash:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.funds.delete(user, meta, id, q.rowVersion);
  }
}
