import { Module } from '@nestjs/common';
import { GetRecordHistory } from './application/get-record-history.use-case.js';
import { RecordHistoryRepository } from './domain/record-history.js';
import { PrismaRecordHistoryRepository } from './infrastructure/prisma-record-history.repository.js';
import { HistoryController } from './presentation/history.controller.js';

/** Row history (who changed what) for every audited record. */
@Module({
  controllers: [HistoryController],
  providers: [GetRecordHistory, { provide: RecordHistoryRepository, useClass: PrismaRecordHistoryRepository }],
})
export class HistoryModule {}
