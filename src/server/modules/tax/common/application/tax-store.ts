import type {
  FbrBacklog, FbrConnectionEvent, FbrSubmission, FbrSubmissionList, FbrSubmissionQuery, SalesTaxReturn, SalesTaxReturnLine, SalesTaxReturnList,
  SalesTaxReturnQuery, WhtCertificate, WhtCertificateList, WhtCertificateQuery, WhtChallan, WhtDeduction, WhtDeductionInput, WhtDeductionList, WhtQuery,
  WhtStatement,
} from '../../../../../shared/index.js';
import type { FbrDocument, FbrSendResult } from '../../fbr/application/fbr-gateway.js';

export type TaxOptions = {
  bankAccounts: { id: string; name: string }[];
  /** WHT sections: code → label (lookup DefaultWhtSection plus sections already used). */
  sections: { code: string; label: string }[];
  vendors: { id: string; name: string; ntnCnic: string | null }[];
  customers: { id: string; name: string; ntnCnic: string | null }[];
  employees: { id: string; name: string }[];
  /** Company tax ids for page headings. */
  ntn: string | null;
  strn: string | null;
  companyName: string | null;
};

/** Facts behind a return's pre-filing checks. */
export type ReturnFacts = {
  annexCMissingTaxId: number;
  /** Net credit to the OUTPUT_GST account(s) in the month (posted vouchers), null when no account is mapped. */
  glOutputTax: number | null;
  unmatched: { count: number; tax: number; first: { party: string | null; documentNo: string | null; tax: number } | null };
  furtherTaxInvoices: number;
  fbrReported: number;
  fbrRequired: number;
  /** Input tax of documents from blacklisted / inactive vendors (not checkable yet → 0). */
};

export type WhtSectionRow = { direction: string; whtSection: string; transactions: number; taxableAmount: number; rates: number[]; taxAmount: number; unpaid: number };

export type FbrTenantConfig = {
  tenantId: string;
  tenantCode: string;
  configId: string;
  authority: string;
  environment: string;
  posId: string;
  ntn: string;
  sendingEnabled: boolean;
  syncIntervalMinutes: number;
  lastSyncAt: Date | null;
  connectionStatus: string;
};
export type DueSubmission = { id: string; invoiceId: string | null; creditNoteId: string | null; documentNo: string; posId: string; attempts: number; rowVersion: number };

/** Persistence for Phase 28: returns, WHT register / challans / certificates / statements, FBR submissions. */
export abstract class TaxStore {
  abstract options(tenantId: string): Promise<TaxOptions>;

  // ---------------------------------------------------------------- sales tax returns
  abstract listReturns(tenantId: string, q: SalesTaxReturnQuery): Promise<SalesTaxReturnList>;
  abstract getReturn(tenantId: string, id: string): Promise<(SalesTaxReturn & { lines: SalesTaxReturnLine[] }) | null>;
  abstract returnFacts(tenantId: string, r: SalesTaxReturn): Promise<ReturnFacts>;
  /** Tax.salesTaxReturnPrepare: creates or refreshes the draft of a month. */
  abstract prepareReturn(periodMonth: string, authority: string): Promise<string>;
  /** Draft fields; false when the row changed or is no longer a draft. */
  abstract saveReturnDraft(tenantId: string, id: string, rowVersion: number, data: { remarks?: string | null; excludeUnmatchedInput?: boolean }): Promise<boolean>;
  abstract setUnmatched(tenantId: string, returnId: string, unmatchedLineIds: string[]): Promise<void>;
  abstract recalcReturn(id: string): Promise<void>;
  abstract setReturnStatus(tenantId: string, id: string, rowVersion: number, from: string[], to: string): Promise<boolean>;
  abstract fileReturn(id: string): Promise<void>;
  abstract payReturn(id: string, data: { cprNo: string; paidOn: string; paidAmount: number; bankAccountId: string }): Promise<void>;
  abstract cprInUse(tenantId: string, cprNo: string): Promise<boolean>;
  abstract deleteReturn(tenantId: string, id: string, rowVersion: number): Promise<boolean>;

  // ---------------------------------------------------------------- WHT register and challans
  abstract listDeductions(tenantId: string, q: WhtQuery): Promise<WhtDeductionList>;
  abstract getDeduction(tenantId: string, id: string): Promise<WhtDeduction | null>;
  abstract sectionSummary(tenantId: string, period: string): Promise<WhtSectionRow[]>;
  abstract sufferedTotal(tenantId: string, period: string): Promise<number>;
  abstract createDeduction(tenantId: string, input: WhtDeductionInput): Promise<string>;
  /** Manual UNPAID deductions only; false when not found, changed, system-generated or no longer unpaid. */
  abstract updateDeduction(tenantId: string, id: string, rowVersion: number, input: WhtDeductionInput): Promise<boolean>;
  abstract deleteDeduction(tenantId: string, id: string, rowVersion: number): Promise<boolean>;

  abstract listChallans(tenantId: string, from: string | null, to: string | null): Promise<WhtChallan[]>;
  abstract getChallan(tenantId: string, id: string): Promise<WhtChallan | null>;
  abstract unpaidTotal(tenantId: string, period: string, sections: string[]): Promise<number>;
  abstract saveChallan(data: Record<string, unknown>): Promise<string>;
  abstract payChallan(id: string): Promise<void>;
  abstract cancelChallan(id: string, reason: string | null): Promise<void>;
  abstract deleteChallan(tenantId: string, id: string, rowVersion: number): Promise<boolean>;

  // ---------------------------------------------------------------- certificates and statements
  abstract listCertificates(tenantId: string, q: WhtCertificateQuery): Promise<WhtCertificateList>;
  abstract getCertificate(tenantId: string, id: string): Promise<WhtCertificate | null>;
  abstract certificateDeductions(tenantId: string, id: string): Promise<WhtDeduction[]>;
  abstract generateCertificates(from: string, to: string): Promise<number>;
  abstract issueCertificate(id: string): Promise<void>;
  abstract receiveCertificate(data: Record<string, unknown>): Promise<string>;
  abstract claimCertificate(id: string): Promise<void>;
  abstract cancelCertificate(id: string, reason: string | null): Promise<void>;
  abstract deleteCertificate(tenantId: string, id: string, rowVersion: number): Promise<boolean>;

  abstract listStatements(tenantId: string): Promise<WhtStatement[]>;
  abstract getStatement(tenantId: string, id: string): Promise<WhtStatement | null>;
  abstract prepareStatement(type: string, from: string, to: string, label: string, dueDate: string): Promise<string>;
  abstract fileStatement(tenantId: string, id: string, rowVersion: number, filedOn: string, irisReference: string): Promise<boolean>;

  // ---------------------------------------------------------------- FBR submissions
  abstract fbrConfig(tenantId: string, authority: string): Promise<FbrTenantConfig | null>;
  /** Companies whose sending is on (for the sync job). */
  abstract sendingConfigs(): Promise<FbrTenantConfig[]>;
  abstract listSubmissions(tenantId: string, q: FbrSubmissionQuery): Promise<FbrSubmissionList>;
  abstract getSubmission(tenantId: string, id: string): Promise<FbrSubmission | null>;
  /** Submissions to send now: PENDING / FAILED whose retry time has come; `all` takes every open one, `ids` only those. */
  abstract dueSubmissions(tenantId: string, configId: string, limit: number, opts?: { ids?: string[]; all?: boolean }): Promise<DueSubmission[]>;
  abstract fbrDocument(tenantId: string, sub: DueSubmission): Promise<FbrDocument | null>;
  abstract recordAttempt(tenantId: string, sub: DueSubmission, result: FbrSendResult, nextRetryAt: Date | null): Promise<void>;
  abstract setRetryNow(tenantId: string, id: string): Promise<boolean>;
  abstract requeue(tenantId: string, id: string): Promise<boolean>;
  abstract backlog(tenantId: string, configId: string): Promise<FbrBacklog>;
  abstract skipRange(tenantId: string, configId: string, from: string, to: string): Promise<number>;
  abstract events(tenantId: string, configId: string, limit: number): Promise<FbrConnectionEvent[]>;
  abstract addEvent(tenantId: string, configId: string, e: { event: string; ok: boolean; latencyMs: number | null; retriedCount?: number | null; details: string | null; actorUserId: string | null }): Promise<void>;
  abstract setConnection(tenantId: string, configId: string, data: { connectionStatus?: string; lastHealthCheckAt?: Date; lastLatencyMs?: number | null; lastSyncAt?: Date }): Promise<void>;
}
