import { Injectable } from '@nestjs/common';
import type { ReportQuery, SessionUser } from '../../../../../shared/index.js';
import { ValidationError } from '../../../../core/domain/errors.js';
import { LedgerReportStore } from './ledger-report-store.js';

const today = () => new Date().toISOString().slice(0, 10);
const MAX_GL_ROWS = 5000;

/** Trial balance, general ledger and day book, read from posted vouchers. */
@Injectable()
export class LedgerReportsService {
  constructor(private readonly store: LedgerReportStore) {}

  private async range(user: SessionUser, q: ReportQuery) {
    const to = q.to ?? today();
    const from = q.from ?? (await this.store.yearStart(user.tenantId, to));
    if (from > to) throw new ValidationError('The start date must be on or before the end date', { from: ['On or before the end date'] });
    return { from, to };
  }

  async trialBalance(user: SessionUser, q: ReportQuery) {
    const { from, to } = await this.range(user, q);
    const rows = await this.store.trialBalance(user.tenantId, from, to, q.branch ?? null, q.level);
    const shown = q.zero ? rows : rows.filter((r) => r.openingDr || r.openingCr || r.movementDr || r.movementCr || r.closingDr || r.closingCr);
    return { from, to, rows: shown };
  }

  async generalLedger(user: SessionUser, q: ReportQuery) {
    const { from, to } = await this.range(user, q);
    const rows = await this.store.generalLedger(user.tenantId, from, to, q.account ?? null, q.branch ?? null);
    return { from, to, rows: rows.slice(0, MAX_GL_ROWS), truncated: rows.length > MAX_GL_ROWS };
  }

  async dayBook(user: SessionUser, q: ReportQuery) {
    const date = q.date ?? today();
    return { date, rows: await this.store.dayBook(user.tenantId, date, q.branch ?? null) };
  }
}
