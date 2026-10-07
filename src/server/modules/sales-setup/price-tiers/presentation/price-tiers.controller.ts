import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { PriceTierUpdateSchema, type PriceTierUpdate, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PriceTiersService } from '../application/price-tiers.service.js';

/** /api/distribution/price-tiers: the "Price tiers" tab of Sales › Price Lists & Schemes. */
@Controller('distribution/price-tiers')
export class PriceTiersController {
  constructor(private readonly tiers: PriceTiersService) {}

  @Get()
  @RequirePermission('pricetier:view')
  list(@CurrentUser() user: SessionUser) {
    return this.tiers.list(user);
  }

  @Patch(':id')
  @RequirePermission('pricetier:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(PriceTierUpdateSchema)) body: PriceTierUpdate) {
    return this.tiers.update(user, meta, id, body);
  }
}
