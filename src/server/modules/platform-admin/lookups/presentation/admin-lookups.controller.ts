import { Controller, Get, Query } from '@nestjs/common';
import { LookupsQuerySchema, type LookupsResponse } from '../../../../../shared/index.js';
import { AdminRoute } from '../../../../common/decorators/admin-route.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import { AdminLookupsReader } from '../application/admin-lookups.reader.js';

/** GET /api/admin/lookups?types=BillingUnit,SupportChannel: platform-wide select values for the Super Admin portal. */
@AdminRoute()
@Controller('admin/lookups')
export class AdminLookupsController {
  constructor(private readonly lookups: AdminLookupsReader) {}

  @Get()
  list(@Query(new ZodValidationPipe(LookupsQuerySchema)) query: { types: string[] }): Promise<LookupsResponse> {
    return this.lookups.byTypes(query.types);
  }
}
