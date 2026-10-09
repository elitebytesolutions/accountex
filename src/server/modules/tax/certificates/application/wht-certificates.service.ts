import { Injectable } from '@nestjs/common';
import type { SessionUser, WhtCertificateQuery, WhtCertificateReceive, WhtStatementPrepare } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { TaxStore } from '../../common/application/tax-store.js';
import { statementPeriod } from '../../wht/domain/tax-periods.js';

const changed = (what: string) => new ConcurrencyError(`This ${what} was changed. Reload and try again.`);
const badState = (msg: string) => new ConflictError(msg, undefined, { code: 'WHT_CERT_INVALID_STATE' });

/**
 * WHT certificates and statements. Deduction certificates (ISSUED) are generated per vendor / employee and section from
 * paid deductions, then issued (numbered WHTC, printed from the browser). Certificates received from customers link
 * their SUFFERED deductions and are claimed. Quarterly / annual statements total the period's deductions and are filed
 * with the IRIS reference.
 */
@Injectable()
export class WhtCertificatesService {
  constructor(private readonly store: TaxStore, private readonly unitOfWork: UnitOfWork) {}

  list(user: SessionUser, q: WhtCertificateQuery) {
    return this.store.listCertificates(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const c = await this.store.getCertificate(user.tenantId, id);
    if (!c) throw new NotFoundError('Certificate not found');
    return c;
  }

  /** The certificate with its deductions and the company details, for the print view. */
  async print(user: SessionUser, id: string) {
    const [c, deductions, o] = await Promise.all([this.get(user, id), this.store.certificateDeductions(user.tenantId, id), this.store.options(user.tenantId)]);
    return { certificate: c, deductions, company: { name: o.companyName, ntn: o.ntn } };
  }

  async generate(user: SessionUser, meta: RequestMeta, from: string, to: string) {
    const created = await this.unitOfWork.run(actorContext(user, meta), () => this.store.generateCertificates(from, to));
    return { created };
  }

  async issue(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.direction !== 'ISSUED' || c.status !== 'DRAFT') throw badState('Only a draft deduction certificate can be issued.');
    if (c.rowVersion !== rowVersion) throw changed('certificate');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.issueCertificate(id));
    return this.get(user, id);
  }

  async receive(user: SessionUser, meta: RequestMeta, input: WhtCertificateReceive) {
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.receiveCertificate({ ...input }));
    return this.get(user, id);
  }

  async claim(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.direction !== 'RECEIVED' || c.status !== 'RECEIVED') throw badState('Only a received certificate can be claimed.');
    if (c.rowVersion !== rowVersion) throw changed('certificate');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.claimCertificate(id));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string | null) {
    const c = await this.get(user, id);
    if (c.status === 'CANCELLED' || c.status === 'DRAFT') throw badState(c.status === 'DRAFT' ? 'Delete a draft certificate instead.' : 'This certificate is already cancelled.');
    if (c.rowVersion !== rowVersion) throw changed('certificate');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.cancelCertificate(id, reason));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.status !== 'DRAFT') throw badState('Only a draft certificate can be deleted; cancel it instead.');
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteCertificate(user.tenantId, id, rowVersion)))) throw changed('certificate');
  }

  // ---------------------------------------------------------------- statements
  listStatements(user: SessionUser) {
    return this.store.listStatements(user.tenantId);
  }

  async prepareStatement(user: SessionUser, meta: RequestMeta, input: WhtStatementPrepare) {
    const p = statementPeriod(input.returnType, input.periodOf);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.prepareStatement(input.returnType, p.from, p.to, p.label, p.dueDate));
    return (await this.store.getStatement(user.tenantId, id))!;
  }

  async fileStatement(user: SessionUser, meta: RequestMeta, id: string, input: { filedOn: string; irisReference: string; rowVersion: number }) {
    const s = await this.store.getStatement(user.tenantId, id);
    if (!s) throw new NotFoundError('Statement not found');
    if (s.status !== 'IN_PREPARATION') throw new ConflictError('This statement is already filed.', undefined, { code: 'WHT_STATEMENT_EXISTS' });
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.fileStatement(user.tenantId, id, input.rowVersion, input.filedOn, input.irisReference)))) throw changed('statement');
    return (await this.store.getStatement(user.tenantId, id))!;
  }
}
