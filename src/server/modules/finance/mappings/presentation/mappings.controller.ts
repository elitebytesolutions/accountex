import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { AccountMappingSaveSchema, type AccountMappingSave, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { MappingsService } from '../application/mappings.service.js';

/** /api/settings/account-mappings: Settings › Finance › Default account mapping. */
@Controller('settings/account-mappings')
export class MappingsController {
  constructor(private readonly mappings: MappingsService) {}

  /** `?all=1` lists every posting role (later modules map theirs). */
  @Get()
  @RequirePermission('comp:view')
  list(@CurrentUser() user: SessionUser, @Query('all') all?: string) {
    return this.mappings.list(user, all === '1' || all === 'true');
  }

  @Put()
  @RequirePermission('comp:edit')
  save(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(AccountMappingSaveSchema)) body: AccountMappingSave) {
    return this.mappings.save(user, meta, body);
  }
}
