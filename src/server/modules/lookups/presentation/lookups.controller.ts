import { Controller, Get, Query } from '@nestjs/common';
import { LookupsQuerySchema, type LookupsResponse, type SessionUser } from '../../../../shared/index.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { LookupsReader } from '../application/lookups-reader.js';

/** GET /api/lookups?types=Province,PaperSize: values for selects. Any signed-in user may read them. */
@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookups: LookupsReader) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(LookupsQuerySchema)) query: { types: string[] }): Promise<LookupsResponse> {
    return this.lookups.byTypes(query.types, user.tenantId);
  }
}
