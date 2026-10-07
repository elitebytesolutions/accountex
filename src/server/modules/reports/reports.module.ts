import { Module } from '@nestjs/common';
import { ReportPreviewService } from './saved-reports/application/report-preview.service.js';
import { ReportStore } from './saved-reports/application/report-store.js';
import { SavedReportsService } from './saved-reports/application/saved-reports.service.js';
import { PrismaReportStore } from './saved-reports/infrastructure/prisma-report.store.js';
import { ReportsController } from './saved-reports/presentation/reports.controller.js';

/** Report Studio (Phase 15): saved report definitions, shares, schedules and the live read-only preview. Sending schedules: Phase 35. */
@Module({
  controllers: [ReportsController],
  providers: [SavedReportsService, ReportPreviewService, { provide: ReportStore, useClass: PrismaReportStore }],
})
export class ReportsModule {}
