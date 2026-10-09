import { Injectable } from '@nestjs/common';
import { batchRowErrors, type ChequeBatch, type ChequeBatchInput, type ChequeInput, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { BankTransactionsService } from '../../transactions/application/bank-transactions.service.js';
import { ChequeStore } from './cheque-store.js';
import { ChequesService } from './cheques.service.js';

/**
 * Bulk cheque vouchers: a sheet of received (customer) or issued (vendor) cheques entered on screen or uploaded, checked
 * row by row, then generated as cheques — deposited, held as PDC or cleared on deposit per the batch's posting mode.
 */
@Injectable()
export class ChequeBatchesService {
  constructor(
    private readonly store: ChequeStore,
    private readonly cheques: ChequesService,
    private readonly txns: BankTransactionsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.batches(user.tenantId);
  }

  async get(user: SessionUser, id: string) {
    const b = await this.store.batch(user.tenantId, id);
    if (!b) throw new NotFoundError('Cheque batch not found');
    return b;
  }

  async create(user: SessionUser, meta: RequestMeta, input: ChequeBatchInput) {
    const data = await this.payload(user, input, null);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveBatch({ ...data, status: 'DRAFT', preparedByUserId: user.id }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: ChequeBatchInput & { rowVersion: number }) {
    const b = await this.current(user, id, input.rowVersion);
    if (b.status !== 'DRAFT' && b.status !== 'VALIDATED') throw new ConflictError('Only a draft batch can be changed.');
    const data = await this.payload(user, input, b);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (b.status === 'VALIDATED') await this.store.setBatch(user.tenantId, id, { status: 'DRAFT' });
      const fresh = (await this.store.batch(user.tenantId, id))!;
      await this.store.saveBatch({ ...data, id, rowVersion: fresh.rowVersion });
    });
    return this.get(user, id);
  }

  /** Checks every row (party code, cheque no., dates, amount, duplicates in the sheet and in the books). */
  async validate(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const b = await this.current(user, id, rowVersion);
    if (b.status !== 'DRAFT' && b.status !== 'VALIDATED') throw new ConflictError('This batch is already generated or cancelled.');
    const opts = await this.txns.options(user);
    const parties = new Map((b.direction === 'RECEIVED' ? opts.customers : opts.vendors).map((p) => [p.code.toUpperCase(), { id: p.id, name: p.name }]));
    const errors = batchRowErrors(b.lines, parties);
    for (const [i, l] of b.lines.entries()) {
      if (errors[i]!.chequeNo || l.cheque) continue;
      const party = parties.get(l.partyCode.toUpperCase());
      const used = b.direction === 'ISSUED'
        ? await this.store.issuedLeafUsed(user.tenantId, b.bankAccount.id, l.chequeNo, null)
        : await this.store.receivedDuplicate(user.tenantId, null, l.chequeNo, party?.id ?? null, null);
      if (used) errors[i]!.chequeNo = 'Already recorded';
    }
    const valid = errors.filter((e) => !Object.keys(e).length).length;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const [i, l] of b.lines.entries()) {
        if (l.cheque) continue;
        const party = parties.get(l.partyCode.toUpperCase());
        const ok = !Object.keys(errors[i]!).length;
        await this.store.setBatchLine(user.tenantId, l.id, {
          validationStatus: ok ? 'VALID' : 'INVALID', validationErrors: ok ? undefined : errors[i],
          customerId: b.direction === 'RECEIVED' ? (party?.id ?? null) : null, vendorId: b.direction === 'ISSUED' ? (party?.id ?? null) : null,
        });
      }
      await this.store.setBatch(user.tenantId, id, { status: valid ? 'VALIDATED' : 'DRAFT' });
    });
    return { batch: await this.get(user, id), valid, invalid: b.lines.length - valid };
  }

  /** One cheque per valid row, each in its own transaction; rows that fail are marked and the batch is PARTIAL. */
  async generate(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    let b = await this.current(user, id, rowVersion);
    if (b.status === 'DRAFT') b = (await this.validate(user, meta, id, rowVersion)).batch;
    if (b.status !== 'VALIDATED' && b.status !== 'PARTIAL') throw new ConflictError('Validate the batch first; it has no valid rows.');
    let made = 0, failed = 0;
    for (const l of b.lines) {
      if (l.validationStatus !== 'VALID' || l.cheque) continue;
      const pdc = l.chequeDate > b.docDate;
      const input: ChequeInput = {
        direction: b.direction as ChequeInput['direction'], docDate: b.docDate, branchId: b.branch.id, chequeNo: l.chequeNo,
        customerId: l.customerId, vendorId: l.vendorId, accountId: null, partyName: l.partyName, drawnOnBankId: null,
        bankAccountId: b.bankAccount.id, chequeDate: l.chequeDate, dueDate: l.dueDate, receivedOn: b.direction === 'RECEIVED' ? b.docDate : null, amount: l.amount,
        isPdc: pdc || b.postingMode === 'HOLD_PDC', postingMode: (b.postingMode === 'HOLD_PDC' && !pdc ? 'DEPOSIT' : b.postingMode) as ChequeInput['postingMode'],
        chequeBookId: null, crossedAcPayee: true,
        legacyNo: b.oldNoRule === 'BLANK' ? null : l.legacyNo, remarks: [b.remarksPrefix, l.remarks].filter(Boolean).join(' ') || null, narration: null,
      };
      try {
        await this.unitOfWork.run(actorContext(user, meta), async () => {
          const chequeId = await this.cheques.createIn(user, input);
          // received cheques that are due go straight to the bank per the posting mode; PDCs stay in hand
          if (b.direction === 'RECEIVED' && !input.isPdc && b.postingMode !== 'HOLD_PDC') {
            const c = await this.cheques.get(user, chequeId);
            await this.cheques.deposit(user, meta, chequeId, { date: b.docDate, bankAccountId: b.bankAccount.id, remarks: null, rowVersion: c.rowVersion });
          }
          await this.store.setBatchLine(user.tenantId, l.id, { validationStatus: 'GENERATED', chequeId });
        });
        made++;
      } catch (err) {
        failed++;
        await this.unitOfWork.run(actorContext(user, meta), () => this.store.setBatchLine(user.tenantId, l.id, { validationStatus: 'INVALID', validationErrors: { chequeNo: (err as Error).message.slice(0, 200) } }));
      }
    }
    const after = await this.get(user, id);
    const open = after.lines.filter((l) => l.validationStatus !== 'GENERATED').length;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setBatch(user.tenantId, id, { status: open ? 'PARTIAL' : 'GENERATED', generatedAt: new Date() }));
    return { batch: await this.get(user, id), generated: made, failed };
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string | null) {
    const b = await this.current(user, id, rowVersion);
    if (b.lines.some((l) => l.cheque)) throw new ConflictError('Cheques were already generated from this batch; cancel those cheques instead.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.cancelBatch(id, reason));
    return this.get(user, id);
  }

  private async payload(user: SessionUser, input: ChequeBatchInput, existing: ChequeBatch | null) {
    const opts = await this.txns.options(user);
    const bank = opts.bankAccounts.find((x) => x.id === input.bankAccountId);
    if (!bank || bank.status !== 'ACTIVE') throw new ValidationError('Choose an active bank account', { bankAccountId: ['Choose an active bank account'] });
    if (!opts.branches.some((x) => x.id === input.branchId)) throw new ValidationError('Choose an active branch', { branchId: ['Choose an active branch'] });
    // the sheet's format (the table's checks); unknown party codes are flagged by Validate, not here
    const errors = batchRowErrors(input.lines, new Map(input.lines.map((l) => [l.partyCode.toUpperCase(), { id: '', name: '' }])));
    const bad = Object.fromEntries(errors.flatMap((e, i) => Object.entries(e).filter(([k]) => k !== 'partyCode').map(([k, m]) => [`lines.${i}.${k}`, [m]])));
    if (Object.keys(bad).length) throw new ValidationError(`${Object.keys(bad).length} cell(s) need fixing before the sheet can be saved`, bad);
    const known = new Set(existing?.lines.filter((l) => !l.cheque).map((l) => l.id) ?? []);
    const lines = input.lines.map((l, i) => ({
      ...(l.id && known.has(l.id) && { id: l.id }), lineNo: i + 1, partyCode: l.partyCode.toUpperCase(), partyName: l.partyName, chequeNo: l.chequeNo,
      chequeDate: l.chequeDate, dueDate: l.dueDate, amount: l.amount, remarks: l.remarks, legacyNo: l.legacyNo, validationStatus: 'PENDING',
    }));
    return {
      direction: input.direction, docDate: input.docDate, branchId: input.branchId, bankAccountId: input.bankAccountId, postingMode: input.postingMode,
      oldNoRule: input.oldNoRule, remarksPrefix: input.remarksPrefix, source: input.source, rowCount: lines.length,
      totalAmount: Math.round(input.lines.reduce((t, l) => t + l.amount, 0) * 100) / 100, lines,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const b = await this.get(user, id);
    if (b.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this batch. Reload and try again.');
    return b;
  }
}
