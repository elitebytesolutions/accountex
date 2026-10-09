import type { Cheque, ChequeBatch, ChequeList, ChequeQuery } from '../../../../../shared/index.js';

export abstract class ChequeStore {
  abstract list(tenantId: string, q: ChequeQuery, today: string, fyStart: string): Promise<ChequeList>;
  abstract get(tenantId: string, id: string): Promise<Cheque | null>;
  abstract fiscalYearStart(tenantId: string, today: string): Promise<string>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Plain column changes the lifecycle functions don't make (dates, status moves the DB guard allows). */
  abstract set(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  /** Posts the receipt / issue voucher (BankCash.chequeRecordEntries). */
  abstract record(id: string, date?: string): Promise<void>;
  abstract lifecycle(fn: 'chequeDeposit' | 'chequeClear' | 'chequePresent' | 'chequeBounce' | 'chequeCancel', id: string): Promise<void>;
  /** Reverses the cheque's still-posted vouchers (clearing first). */
  abstract reverseEntries(id: string, date: string, remarks: string): Promise<void>;
  abstract addBounce(tenantId: string, data: Record<string, unknown>): Promise<void>;
  abstract resolveBounce(tenantId: string, chequeId: string, resolution: string, on: string, replacementChequeId?: string): Promise<void>;
  abstract issuedLeafUsed(tenantId: string, bankAccountId: string, chequeNo: string, exceptId: string | null): Promise<boolean>;
  abstract receivedDuplicate(tenantId: string, drawnOnBankId: string | null, chequeNo: string, customerId: string | null, exceptId: string | null): Promise<boolean>;
  abstract chequeBook(tenantId: string, id: string): Promise<{ id: string; bankAccountId: string; firstLeafNo: number; lastLeafNo: number; nextLeafNo: number; status: string } | null>;
  abstract advanceBook(tenantId: string, id: string, nextLeafNo: number): Promise<void>;
  // batches
  abstract batches(tenantId: string): Promise<Omit<ChequeBatch, 'lines'>[]>;
  abstract batch(tenantId: string, id: string): Promise<ChequeBatch | null>;
  abstract saveBatch(data: Record<string, unknown>): Promise<string>;
  abstract setBatch(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract setBatchLine(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract cancelBatch(id: string, reason: string | null): Promise<void>;
}
