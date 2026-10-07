import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { HistoryQuerySchema, type HistoryPage, type HistoryQuery, type SessionUser } from '../../../../shared/index.js';
import { ReqMeta } from '../../../common/context/request-meta.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { GetRecordHistory } from '../application/get-record-history.use-case.js';

/** GET /api/history/:schema/:table/:id: the History tab of any registered record. */
@Controller('history')
export class HistoryController {
  constructor(private readonly getRecordHistory: GetRecordHistory) {}

  @Get(':schema/:table/:id')
  history(
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
    @Param('schema') schema: string,
    @Param('table') table: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(HistoryQuerySchema)) query: HistoryQuery,
  ): Promise<HistoryPage> {
    return this.getRecordHistory.execute(user, meta, { schema, table, recordId: id }, query);
  }
}
