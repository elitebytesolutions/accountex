import { z } from 'zod';
import { RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from './common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const positive = z.coerce.number('Enter an amount').positive('More than 0').max(100_000_000_000);
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;
type VoucherRef = { id: string; docNo: string; voucherType: string; status: string } | null;

// ---------------------------------------------------------------- options
export type BankingBankAccount = {
  id: string; title: string; last4: string | null; bankName: string; branchId: string; accountId: string | null; status: string;
  reconciledTo: string | null; lastStatementBalance: number | null; statementLayout: StatementLayout | null;
  chequeBooks: { id: string; bookRef: string | null; firstLeafNo: number; lastLeafNo: number; nextLeafNo: number; status: string }[];
};
export type BankingOptions = {
  bankAccounts: BankingBankAccount[];
  banks: { id: string; code: string; name: string }[];
  customers: (Ref & { accountId: string | null })[];
  vendors: (Ref & { accountId: string | null })[];
  accounts: (Ref & { accountClass: number })[];
  costCentres: Ref[];
  branches: Ref[];
  /** Posting roles the cheque postings need, with their accounts (null when not set). */
  postingRoles: Record<string, Ref | null>;
};

// ---------------------------------------------------------------- bank transactions
export const BANK_TXN_CATEGORIES = ['CUSTOMER_RECEIPT', 'VENDOR_PAYMENT', 'BANK_CHARGES', 'PROFIT_ON_DEPOSIT', 'MARKUP_EXPENSE', 'CASH_DEPOSIT', 'CASH_WITHDRAWAL', 'TRANSFER', 'PAYROLL', 'TAX_PAYMENT', 'LOAN', 'OTHER'] as const;
export type BankTxn = {
  id: string; bankAccount: { id: string; title: string; last4: string | null }; txnDate: string; valueDate: string | null; description: string;
  detail: string | null; reference: string | null; paymentMode: string | null; category: string | null; deposit: number; withdrawal: number;
  cheque: { id: string; docNo: string; chequeNo: string } | null; voucher: VoucherRef; source: string; status: string;
  statementLineId: string | null; clearedOn: string | null; reconciledOn: string | null; createdBy: Who; rowVersion: number;
};
export type BankBook = {
  bankAccount: { id: string; title: string; last4: string | null; glCode: string | null }; from: string; to: string; opening: number; closing: number;
  deposits: number; withdrawals: number; rows: (BankTxn & { balance: number })[];
};
export const BankBookQuerySchema = z.object({ account: z.uuid('Choose the bank account'), from: z.iso.date(), to: z.iso.date() });
export type BankTxnList = {
  items: BankTxn[]; total: number;
  kpis: { deposits: number; withdrawals: number; uncategorised: number; bankCharges: number };
  statusCounts: Record<string, number>;
};
export const BankTxnQuerySchema = z.object({
  account: z.uuid().optional(), from: z.iso.date().optional(), to: z.iso.date().optional(), status: z.string().trim().max(20).optional(),
  type: z.enum(['deposit', 'withdrawal', 'uncategorised']).optional(), search: z.string().trim().max(100).optional(),
  mine: z.enum(['1']).optional(), minAmount: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
export type BankTxnQuery = z.infer<typeof BankTxnQuerySchema>;
/** Turns an imported (uncategorised) line into a BPV / BRV against the chosen account. */
export const CategoriseSchema = z.object({
  accountId: z.uuid('Choose the account'),
  category: z.enum(BANK_TXN_CATEGORIES).optional().nullable().transform((v) => v ?? null),
  costCentreId: optionalId,
  narration: optionalText(300),
  rowVersion: z.coerce.number().int().min(0),
});
export type CategoriseInput = z.infer<typeof CategoriseSchema>;

// ---------------------------------------------------------------- statement imports
export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY'] as const;
const col = z.coerce.number().int().min(0).max(60);
const optCol = col.optional().nullable().transform((v) => v ?? null);
/** Which CSV column holds what (0-based); amount is one signed column, or a debit (out) and a credit (in) column. */
export const StatementLayoutSchema = z.object({
  delimiter: z.enum([',', ';', '\t', '|']).default(','),
  headerRows: z.coerce.number().int().min(0).max(20).default(1),
  dateFormat: z.enum(DATE_FORMATS).default('DD/MM/YYYY'),
  columns: z.object({ date: col, valueDate: optCol, description: col, reference: optCol, amount: optCol, debit: optCol, credit: optCol, balance: optCol })
    .refine((c) => c.amount !== null || (c.debit !== null && c.credit !== null), { message: 'Choose an amount column, or both debit and credit columns', path: ['amount'] }),
});
export type StatementLayout = z.infer<typeof StatementLayoutSchema>;
export const StatementLineInputSchema = z.object({
  txnDate: z.iso.date(), valueDate: optionalDate, description: z.string().trim().min(1).max(300), reference: optionalText(120),
  amount: z.coerce.number().refine((v) => v !== 0, 'Not zero'), runningBalance: z.coerce.number().optional().nullable().transform((v) => v ?? null),
});
export const StatementImportSchema = z.object({
  bankAccountId: z.uuid('Choose the bank account'),
  fileName: z.string().trim().min(1).max(200),
  layout: StatementLayoutSchema,
  lines: z.array(StatementLineInputSchema).min(1, 'The file has no lines').max(5000),
});
export type StatementImportInput = z.infer<typeof StatementImportSchema>;
export type StatementLine = {
  id: string; lineNo: number; txnDate: string; valueDate: string | null; description: string; reference: string | null; amount: number;
  direction: string; runningBalance: number | null; channel: string | null; status: string; categoryAccount: Ref | null; costCentre: Ref | null;
  bankRule: { id: string; code: string; name: string } | null; bankTransactionId: string | null; voucher: VoucherRef; rowVersion: number;
};
export type StatementImport = {
  id: string; bankAccount: { id: string; title: string; last4: string | null }; fileName: string; format: string; periodFrom: string; periodTo: string;
  openingBalance: number | null; closingBalance: number | null; lineCount: number; duplicateCount: number; matchedCount: number; status: string;
  importedAt: string; importedBy: Who; rowVersion: number; lines?: StatementLine[];
};
export type ImportResult = { import: StatementImport; imported: number; duplicates: number };
export const LineActionSchema = z.object({ rowVersion: z.coerce.number().int().min(0) });

/** Splits CSV text into rows (quotes and doubled quotes handled). */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** A statement date in the given format → YYYY-MM-DD (null when it doesn't parse). */
export function parseStatementDate(raw: string, format: (typeof DATE_FORMATS)[number]): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  const parts = s.split(/[/.\-\s]+/);
  if (parts.length < 3) return null;
  if (format === 'YYYY-MM-DD') [y, m, d] = parts.map(Number) as [number, number, number];
  else if (format === 'MM/DD/YYYY') [m, d, y] = parts.map(Number) as [number, number, number];
  else if (format === 'DD-MMM-YYYY') { d = Number(parts[0]); m = MONTHS.indexOf(parts[1]!.slice(0, 3).toLowerCase()) + 1; y = Number(parts[2]); }
  else [d, m, y] = parts.map(Number) as [number, number, number];
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!y || !m || !d || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
const num = (raw: string | undefined) => {
  if (raw === undefined) return null;
  const t = raw.replace(/[,\s]/g, '').replace(/^\((.*)\)$/, '-$1').replace(/(CR|DR)$/i, '');
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
/** CSV rows → statement lines with per-row errors (header rows skipped). Debit columns are money out (negative). */
export function parseStatement(rows: string[][], layout: StatementLayout) {
  const lines: z.input<typeof StatementLineInputSchema>[] = [];
  const errors: { row: number; message: string }[] = [];
  const c = layout.columns;
  rows.slice(layout.headerRows).forEach((r, i) => {
    const row = i + layout.headerRows + 1;
    const date = parseStatementDate(r[c.date] ?? '', layout.dateFormat);
    let amount: number | null;
    if (c.amount !== null) amount = num(r[c.amount]);
    else {
      const dr = num(r[c.debit!]) ?? 0;
      const cr = num(r[c.credit!]) ?? 0;
      amount = Number.isNaN(dr) || Number.isNaN(cr) ? NaN : Math.round((cr - Math.abs(dr)) * 100) / 100;
    }
    const description = (r[c.description] ?? '').trim();
    if (!date) return errors.push({ row, message: `Date "${r[c.date] ?? ''}" isn't ${layout.dateFormat}` });
    if (amount === null || Number.isNaN(amount) || amount === 0) return errors.push({ row, message: 'No amount' });
    if (!description) return errors.push({ row, message: 'No description' });
    const bal = c.balance !== null ? num(r[c.balance]) : null;
    lines.push({
      txnDate: date, valueDate: c.valueDate !== null ? parseStatementDate(r[c.valueDate] ?? '', layout.dateFormat) : null, description: description.slice(0, 300),
      reference: c.reference !== null ? (r[c.reference] ?? '').trim().slice(0, 120) || null : null, amount, runningBalance: bal !== null && !Number.isNaN(bal) ? bal : null,
    });
  });
  return { lines, errors };
}

// ---------------------------------------------------------------- reconciliation
export type ReconSummary = {
  statementBalance: number; unpresentedCheques: number; depositsInTransit: number; adjustedBankBalance: number;
  bookBalance: number; unbookedCredits: number; unbookedDebits: number; adjustedBookBalance: number; difference: number;
};
export type Reconciliation = ReconSummary & {
  id: string; docNo: string; bankAccount: { id: string; title: string; last4: string | null; glCode: string | null }; periodFrom: string; periodTo: string;
  statementImportId: string | null; status: string; closedBy: Who; closedAt: string | null; remarks: string | null; createdBy: Who; rowVersion: number;
};
export type ReconStatementRow = { id: string; txnDate: string; description: string; reference: string | null; amount: number; status: string; matchId: string | null; suggestedTxnId: string | null };
export type ReconBookRow = { id: string; txnDate: string; description: string; reference: string | null; amount: number; voucher: VoucherRef; status: string; matchId: string | null };
export type ReconMatch = { id: string; statementLineId: string | null; bankTransactionId: string | null; statementAmount: number | null; bookAmount: number | null; status: string; matchMethod: string | null; confidence: number | null; matchedBy: Who; matchedAt: string | null };
export type ReconDetail = Reconciliation & { statement: ReconStatementRow[]; book: ReconBookRow[]; matches: ReconMatch[] };
export const ReconCreateSchema = z.object({
  bankAccountId: z.uuid('Choose the bank account'),
  periodTo: z.iso.date('Use a date'),
  statementBalance: z.coerce.number('Enter the statement balance'),
  remarks: optionalText(300),
});
export const ReconUpdateSchema = z.object({ statementBalance: z.coerce.number('Enter the statement balance'), remarks: optionalText(300), rowVersion: z.coerce.number().int().min(0) });
export const ReconMatchSchema = z.object({ statementLineId: z.uuid(), bankTransactionId: z.uuid(), rowVersion: z.coerce.number().int().min(0) });
export const ReconUnmatchSchema = z.object({ matchId: z.uuid(), rowVersion: z.coerce.number().int().min(0) });
export const ReconAdjustSchema = z.object({
  statementLineIds: z.array(z.uuid()).min(1, 'Choose the statement lines').max(200),
  /** Optional account; default: bank charges for money out, profit on deposit for money in. */
  accountId: optionalId,
  rowVersion: z.coerce.number().int().min(0),
});
export type ReconCreate = z.infer<typeof ReconCreateSchema>;

/** Auto-match score of a statement line against a book entry (0 when amounts differ or dates are more than 7 days apart). */
export function matchScore(line: { amount: number; txnDate: string; reference: string | null; description: string }, book: { amount: number; txnDate: string; reference: string | null }) {
  if (Math.round(line.amount * 100) !== Math.round(book.amount * 100)) return 0;
  const days = Math.abs(Date.parse(line.txnDate) - Date.parse(book.txnDate)) / 86_400_000;
  if (days > 7) return 0;
  const ref = book.reference?.replace(/\s/g, '').toLowerCase();
  const refHit = !!ref && ref.length >= 3 && `${line.reference ?? ''} ${line.description}`.replace(/\s/g, '').toLowerCase().includes(ref);
  return Math.max(50, Math.round((refHit ? 99 : 90) - days * 4));
}

// ---------------------------------------------------------------- cheques
export const CHEQUE_POSTING_MODES = ['DEPOSIT', 'HOLD_PDC', 'CLEAR_ON_DEPOSIT'] as const;
export const BOUNCE_REASONS = ['INSUFFICIENT_FUNDS', 'SIGNATURE_MISMATCH', 'PAYMENT_STOPPED', 'ACCOUNT_CLOSED', 'STALE_OR_POSTDATED', 'OTHER'] as const;
/** Allowed cheque actions per direction and status (the DB guard enforces the same moves). */
export const CHEQUE_ACTIONS: Record<string, Record<string, string[]>> = {
  RECEIVED: { IN_HAND: ['deposit', 'cancel', 'replace', 'edit'], DEPOSITED: ['clear', 'bounce', 'cancel'], CLEARED: ['cancel'], BOUNCED: ['re-present', 'replace', 'cancel'] },
  ISSUED: { ISSUED: ['present', 'clear', 'stop', 'cancel', 'edit'], PRESENTED: ['clear', 'bounce'], CLEARED: ['cancel'], BOUNCED: ['re-present', 'cancel'], STOPPED: ['replace', 'cancel'] },
};
export const chequeActions = (direction: string, status: string) => CHEQUE_ACTIONS[direction]?.[status] ?? [];
export type Cheque = {
  id: string; docNo: string; legacyNo: string | null; docDate: string; branch: Ref; direction: string; chequeNo: string;
  customer: Ref | null; vendor: Ref | null; account: Ref | null; partyName: string; drawnOnBank: { id: string; name: string } | null;
  bankAccount: { id: string; title: string; last4: string | null } | null; chequeDate: string; dueDate: string | null; receivedOn: string | null;
  amount: number; isPdc: boolean; postingMode: string; status: string; depositedOn: string | null; presentedOn: string | null; clearedOn: string | null;
  bouncedOn: string | null; bounceCount: number; stoppedOn: string | null; replacedBy: { id: string; docNo: string } | null; replaces: { id: string; docNo: string } | null;
  voucher: VoucherRef; clearingVoucher: VoucherRef; remarks: string | null; narration: string | null; chequeBookId: string | null; crossedAcPayee: boolean;
  createdBy: Who; rowVersion: number; actions: string[];
  bounces?: { id: string; bounceDate: string; reason: string; bankCharges: number; recoverCharges: boolean; creditHold: boolean; resolution: string; resolvedOn: string | null; reversalVoucher: VoucherRef; chargesVoucher: VoucherRef; remarks: string | null }[];
};
export type ChequeList = {
  items: Cheque[]; total: number;
  kpis: { inHand: number; inHandCount: number; deposited: number; depositedCount: number; issuedUnpresented: number; issuedCount: number; bounced: number; bouncedCount: number; pdcReceivable: number; pdcPayable: number; maturingToday: number };
  calendar: { date: string; receivable: number; payable: number }[];
  statusCounts: Record<string, number>;
};
export const ChequeQuerySchema = z.object({
  direction: z.enum(['RECEIVED', 'ISSUED']).optional(), status: z.string().trim().max(20).optional(), pdc: z.enum(['1']).optional(),
  maturing: z.enum(['30', 'overdue', 'all']).optional(), search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
export type ChequeQuery = z.infer<typeof ChequeQuerySchema>;
const ChequeFields = z.object({
  direction: z.enum(['RECEIVED', 'ISSUED']),
  docDate: z.iso.date('Use a date'),
  branchId: z.uuid('Choose the branch'),
  chequeNo: z.string().trim().regex(/^[0-9]{4,10}$/, '4–10 digits'),
  customerId: optionalId, vendorId: optionalId, accountId: optionalId,
  partyName: z.string().trim().min(1, 'Enter the party').max(160),
  drawnOnBankId: optionalId,
  bankAccountId: optionalId,
  chequeDate: z.iso.date('Use a date'),
  dueDate: optionalDate,
  receivedOn: optionalDate,
  amount: positive,
  isPdc: z.boolean().default(false),
  postingMode: z.enum(CHEQUE_POSTING_MODES).default('DEPOSIT'),
  chequeBookId: optionalId,
  crossedAcPayee: z.boolean().default(true),
  legacyNo: optionalText(40),
  remarks: optionalText(500),
  narration: optionalText(300),
});
/** The cheque's own rules (the DB re-checks them). */
export function chequeErrors(c: z.infer<typeof ChequeFields>): Record<string, string> {
  const e: Record<string, string> = {};
  if (c.direction === 'RECEIVED' && c.vendorId) e.vendorId = 'A received cheque comes from a customer';
  if (c.direction === 'ISSUED' && c.customerId) e.customerId = 'An issued cheque goes to a vendor';
  if ([c.customerId, c.vendorId, c.accountId].filter(Boolean).length > 1) e.accountId = 'Choose a customer, a vendor or an account';
  if (c.direction === 'ISSUED' && !c.bankAccountId) e.bankAccountId = 'Choose the bank account it is drawn on';
  if (c.dueDate && c.dueDate < c.chequeDate) e.dueDate = 'On or after the cheque date';
  if (c.postingMode === 'HOLD_PDC' && !c.isPdc) e.isPdc = 'Holding as PDC needs a post-dated cheque';
  return e;
}
export const ChequeSchema = ChequeFields.superRefine((c, ctx) => { for (const [path, message] of Object.entries(chequeErrors(c))) ctx.addIssue({ code: 'custom', path: [path], message }); });
export type ChequeInput = z.infer<typeof ChequeSchema>;
export const ChequeUpdateSchema = ChequeFields.extend(RowVersionSchema.shape).superRefine((c, ctx) => { for (const [path, message] of Object.entries(chequeErrors(c))) ctx.addIssue({ code: 'custom', path: [path], message }); });
export const ChequeActionSchema = z.object({ date: z.iso.date('Use a date'), bankAccountId: optionalId, remarks: optionalText(300), rowVersion: z.coerce.number().int().min(0) });
export type ChequeAction = z.infer<typeof ChequeActionSchema>;
export const BounceSchema = z.object({
  bounceDate: z.iso.date('Use a date'),
  reason: z.enum(BOUNCE_REASONS, 'Choose the reason'),
  bankCharges: z.coerce.number().min(0).max(1_000_000).default(0),
  recoverCharges: z.boolean().default(false),
  creditHold: z.boolean().default(false),
  remarks: optionalText(300),
  rowVersion: z.coerce.number().int().min(0),
}).refine((b) => !b.recoverCharges || b.bankCharges > 0, { path: ['bankCharges'], message: 'Enter the charges to recover' });
export type BounceInput = z.infer<typeof BounceSchema>;
export const ReplaceSchema = z.object({ cheque: ChequeSchema, rowVersion: z.coerce.number().int().min(0) });

// ---------------------------------------------------------------- cheque batches
export const OLD_NO_RULES = ['AUTO_IF_NEW', 'KEEP_FROM_SHEET', 'BLANK'] as const;
export const BatchLineSchema = z.object({
  id: z.uuid().optional(),
  partyCode: z.string().trim().max(40).default(''),
  partyName: z.string().trim().max(160).default(''),
  chequeNo: z.string().trim().max(20).default(''),
  chequeDate: z.string().trim().max(20).default(''),
  dueDate: z.string().trim().max(20).optional().nullable().transform((v) => v || null),
  amount: z.coerce.number().default(0),
  remarks: optionalText(300),
  legacyNo: optionalText(40),
});
export type BatchLineInput = z.infer<typeof BatchLineSchema>;
export const ChequeBatchSchema = z.object({
  direction: z.enum(['RECEIVED', 'ISSUED']),
  docDate: z.iso.date('Use a date'),
  branchId: z.uuid('Choose the branch'),
  bankAccountId: z.uuid('Choose the bank account'),
  postingMode: z.enum(CHEQUE_POSTING_MODES).default('DEPOSIT'),
  oldNoRule: z.enum(OLD_NO_RULES).default('AUTO_IF_NEW'),
  remarksPrefix: optionalText(60),
  source: z.enum(['SCREEN', 'SHEET']).default('SCREEN'),
  lines: z.array(BatchLineSchema).min(1, 'Add at least one row').max(1000, 'At most 1,000 rows'),
});
export type ChequeBatchInput = z.infer<typeof ChequeBatchSchema>;
export const ChequeBatchUpdateSchema = ChequeBatchSchema.extend(RowVersionSchema.shape);
export type ChequeBatchLine = BatchLineInput & { id: string; lineNo: number; customerId: string | null; vendorId: string | null; validationStatus: string; validationErrors: Record<string, string> | null; cheque: { id: string; docNo: string } | null };
export type ChequeBatch = {
  id: string; docNo: string; docDate: string; branch: Ref; direction: string; bankAccount: { id: string; title: string; last4: string | null };
  postingMode: string; oldNoRule: string; remarksPrefix: string | null; source: string; rowCount: number; totalAmount: number; status: string;
  generatedAt: string | null; preparedBy: Who; rowVersion: number; lines: ChequeBatchLine[];
};
/** Per-row rules of a bulk cheque sheet. `parties` maps party codes (customers for received, vendors for issued). */
export function batchRowErrors(rows: BatchLineInput[], parties: Map<string, { id: string; name: string }>): Record<string, string>[] {
  const seen = new Map<string, number>();
  rows.forEach((r) => r.chequeNo && seen.set(r.chequeNo, (seen.get(r.chequeNo) ?? 0) + 1));
  return rows.map((r) => {
    const e: Record<string, string> = {};
    if (!r.partyCode) e.partyCode = 'Required';
    else if (!parties.has(r.partyCode.toUpperCase())) e.partyCode = 'Unknown party code';
    if (!r.partyName) e.partyName = 'Required';
    if (!/^[0-9]{6,8}$/.test(r.chequeNo)) e.chequeNo = '6–8 digits';
    else if ((seen.get(r.chequeNo) ?? 0) > 1) e.chequeNo = 'Repeated in this sheet';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.chequeDate)) e.chequeDate = 'Use YYYY-MM-DD';
    if (r.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)) e.dueDate = 'Use YYYY-MM-DD';
    else if (r.dueDate && r.chequeDate && r.dueDate < r.chequeDate) e.dueDate = 'Not before the cheque date';
    if (!(r.amount > 0)) e.amount = 'More than 0';
    return e;
  });
}
