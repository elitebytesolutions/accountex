import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import type { EmployeeLetterCreate } from '../../../../../shared/hr/letter.js';
import type {
  LetterRequestCreate, LetterRequestIssue, LetterRequestItem, LetterRequestQuery, LetterRequestReject, LetterRequestUpdate, MyLetterRequests,
} from '../../../../../shared/self-service/letter-request.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { EmployeeLettersService } from '../../../hr/letters/application/letters.service.js';
import { LetterRequestStore } from './letter-request-store.js';

/** Request type → the Phase 33 letter it is issued as (bank letters are employment verifications addressed to the bank). */
const LETTER_OF: Record<string, EmployeeLetterCreate['letterType']> = {
  SALARY_CERTIFICATE: 'SALARY_CERTIFICATE', EXPERIENCE: 'EXPERIENCE', NOC_VISA: 'NOC_TRAVEL', BANK_LETTER: 'EMPLOYMENT_VERIFICATION', EMPLOYMENT_VERIFICATION: 'EMPLOYMENT_VERIFICATION',
};
const notOpen = () => new ConflictError('This letter request is no longer open.', undefined, { code: 'LETTER_REQUEST_NOT_OPEN' });
const noEmployee = () => new ConflictError('Your user is not linked to an employee record. Ask HR to link it.', undefined, { code: 'ESS_NO_EMPLOYEE_RECORD' });
const DUE_MS = 3 * 86_400_000;

/**
 * Letter requests (Phase 34): the employee asks for a letter from My Profile; HR reviews it and issues the Phase 33
 * employee letter (numbered, PDF, verification code) in the same transaction that completes the request, or rejects it.
 */
@Injectable()
export class LetterRequestsService {
  constructor(
    private readonly store: LetterRequestStore,
    private readonly letters: EmployeeLettersService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  // ---------------------------------------------------------------- my requests
  private async me(user: SessionUser) {
    const id = await this.store.employeeOfUser(user.tenantId, user.id);
    if (!id) throw noEmployee();
    return id;
  }

  private async mine(user: SessionUser, id: string) {
    const me = await this.me(user);
    const r = await this.store.get(user.tenantId, id);
    if (!r || r.employee.id !== me) throw new NotFoundError('Letter request not found');
    return r;
  }

  async myList(user: SessionUser): Promise<MyLetterRequests> {
    const me = await this.me(user);
    const [l, types] = await Promise.all([this.store.list(user.tenantId, { status: 'ALL', employeeId: me }), this.store.types()]);
    return { items: l.items, total: l.total, types };
  }

  myGet(user: SessionUser, id: string) {
    return this.mine(user, id);
  }

  async create(user: SessionUser, meta: RequestMeta, input: LetterRequestCreate) {
    const me = await this.me(user);
    const docDate = await this.store.today(user.tenantId);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      ...this.fields(input), employeeId: me, docDate, stage: 'SUBMITTED', dueAt: new Date(Date.now() + DUE_MS).toISOString(),
    }));
    return (await this.store.get(user.tenantId, id))!;
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: LetterRequestUpdate) {
    const r = await this.mine(user, id);
    if (r.status !== 'OPEN' || r.stage !== 'SUBMITTED') throw notOpen();
    this.version(r, input.rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion: input.rowVersion, ...this.fields(input) }));
    return (await this.store.get(user.tenantId, id))!;
  }

  async withdraw(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.mine(user, id);
    if (r.status !== 'OPEN') throw notOpen();
    this.version(r, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: 'WITHDRAWN', withdrawnAt: new Date().toISOString() }));
    return (await this.store.get(user.tenantId, id))!;
  }

  // ---------------------------------------------------------------- HR
  list(user: SessionUser, q: LetterRequestQuery) {
    return this.store.list(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const r = await this.store.get(user.tenantId, id);
    if (!r) throw new NotFoundError('Letter request not found');
    return r;
  }

  async review(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.status !== 'OPEN') throw notOpen();
    this.version(r, rowVersion);
    if (r.stage !== 'SUBMITTED') return r;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, stage: 'HR_REVIEW' }));
    return this.get(user, id);
  }

  /** Issues the Phase 33 letter and completes the request in one transaction (either both happen or neither). */
  async issue(user: SessionUser, meta: RequestMeta, id: string, input: LetterRequestIssue) {
    const r = await this.get(user, id);
    if (r.status !== 'OPEN') throw notOpen();
    this.version(r, input.rowVersion);
    const letterType = LETTER_OF[r.letterType];
    if (!letterType) {
      throw new ConflictError(`A ${r.letterTypeLabel.toLowerCase()} can't be generated as an HR letter yet. Reject this request with a note instead.`, undefined, { code: 'LETTER_REQUEST_NOT_OPEN' });
    }
    const travel = r.letterType === 'NOC_VISA' && r.travelCountry ? `Travel to ${r.travelCountry}, ${r.travelFrom} to ${r.travelTill}` : null;
    const remarks = [r.purpose, travel, r.responsibilities].filter(Boolean).join(' · ').slice(0, 300);
    const today = await this.store.today(user.tenantId);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const letter = await this.letters.issueLetterInTransaction(user, r.employee.id, {
        letterType, docTemplateId: null, addressedTo: r.addressedTo, letterDate: today, signatoryEmployeeId: input.signatoryEmployeeId ?? null,
        includeSalary: r.includeSalary || r.letterType === 'SALARY_CERTIFICATE', remarks: remarks || null,
      });
      await this.store.save({
        id, rowVersion: input.rowVersion, stage: 'READY', status: 'COMPLETED', signedAt: new Date().toISOString(), signedByUserId: user.id,
        hrLetterId: letter.id, pdfAttachmentId: letter.attachmentId, verificationCode: letter.verificationCode, referenceNo: letter.letterNo,
      });
    });
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, input: LetterRequestReject) {
    const r = await this.get(user, id);
    if (r.status !== 'OPEN') throw notOpen();
    this.version(r, input.rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion: input.rowVersion, status: 'REJECTED', rejectedReason: input.reason }));
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  private version(r: LetterRequestItem, rowVersion: number) {
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this request. Reload and try again.');
  }

  private fields(i: LetterRequestCreate) {
    const noc = i.letterType === 'NOC_VISA';
    return {
      letterType: i.letterType, addressedTo: i.addressedTo, purpose: i.purpose,
      travelCountry: noc ? i.travelCountry : null, travelFrom: noc ? i.travelFrom : null, travelTill: noc ? i.travelTill : null,
      includeSalary: i.includeSalary, responsibilities: i.letterType === 'EXPERIENCE' ? i.responsibilities : null, outputFormat: i.outputFormat, language: i.language,
    };
  }
}
