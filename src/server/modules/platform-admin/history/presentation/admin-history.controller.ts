import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { HistoryQuerySchema, type AdminHistoryPage, type HistoryQuery } from '../../../../../shared/index.js';
import { AdminRoute } from '../../../../common/decorators/admin-route.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import { GetPlatformHistory } from '../application/get-platform-history.use-case.js';

/** GET /api/admin/history/:table/:id: the History tab of any registered Platform record (admin-history-tables.ts). */
@AdminRoute()
@Controller('admin/history')
export class AdminHistoryController {
  constructor(private readonly getHistory: GetPlatformHistory) {}

  @Get(':table/:id')
  history(
    @Param('table') table: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(HistoryQuerySchema)) query: HistoryQuery,
  ): Promise<AdminHistoryPage> {
    return this.getHistory.execute(table, id, query);
  }
}
