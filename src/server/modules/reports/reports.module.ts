import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { ReportRunStore, ReportRunsService } from './report-runs/application/report-runs.service.js';
import { PrismaReportRunStore } from './report-runs/infrastructure/prisma-report-run.store.js';
import { ReportRunsController } from './report-runs/presentation/report-runs.controller.js';
import { ReportPreviewService } from './saved-reports/application/report-preview.service.js';
import { ReportStore } from './saved-reports/application/report-store.js';
import { SavedReportsService } from './saved-reports/application/saved-reports.service.js';
import { PrismaReportStore } from './saved-reports/infrastructure/prisma-report.store.js';
import { ReportsController } from './saved-reports/presentation/reports.controller.js';

/** Report Studio (Phase 15): saved report definitions, shares, schedules and the live read-only preview. Sending schedules: Phase 35. */
@Module({
  imports: [AttachmentsModule],
  controllers: [ReportsController, ReportRunsController],
  providers: [
    SavedReportsService, ReportPreviewService, { provide: ReportStore, useClass: PrismaReportStore },
    // Phase 35: report runs (CSV output files, run history)
    ReportRunsService, { provide: ReportRunStore, useClass: PrismaReportRunStore },
  ],
})
export class ReportsModule {}
