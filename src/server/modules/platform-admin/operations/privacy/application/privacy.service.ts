import { Injectable, Logger } from '@nestjs/common';
import type {
  AdminSession, PrivacyApprove, PrivacyCertificate, PrivacyRequest, PrivacyRequestCreate, PrivacyRequestList,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { BackupsService } from '../../../config/backups/application/backups.service.js';
import { soloDecision } from '../../change-requests/domain/solo-approval.js';
import { codeMatches, isProtectedTenant } from '../domain/erasure-policy.js';
import { PrivacyStore } from './privacy-store.js';

const stepOrder = (message: string) => new ConflictError(message, undefined, { code: 'PRIVACY_STEP_ORDER' });
const confirmCode = (code: string) => new ValidationError(`Type the company code ${code} to confirm the deletion.`, { confirmCode: ['Type the company code'] }, { code: 'PRIVACY_CONFIRM_REQUIRED' });

/**
 * Privacy requests (Security & Privacy): RECEIVED → Verify → Approve → fulfil → DONE with a certificate.
 * EXPORT: one approver; fulfilling writes the company's JSON through the backup runner (TENANT_EXPORT), downloadable for
 * 7 days. DELETE: two approvers (or one solo approval: typed company code + note) and the typed company code again to
 * run the irreversible anonymisation (Platform.privacyRequestFulfilDelete). Demo and Test Co are refused.
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger('PrivacyRequests');

  constructor(
    private readonly store: PrivacyStore,
    private readonly backups: BackupsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(): Promise<PrivacyRequestList> {
    const [items, solo] = await Promise.all([this.store.list(), this.store.isSolo()]);
    return { items, solo };
  }

  async get(id: string): Promise<PrivacyRequest> {
    const r = await this.store.get(id);
    if (!r) throw new NotFoundError('Privacy request not found');
    return r;
  }

  async create(admin: AdminSession, meta: RequestMeta, input: PrivacyRequestCreate): Promise<PrivacyRequest> {
    const t = await this.store.tenant(input.tenantId);
    if (!t) throw new ValidationError('Choose the company', { tenantId: ['Unknown company'] });
    if (input.requestType === 'DELETE' && isProtectedTenant(t.code)) {
      throw new ForbiddenError(`${t.name} is protected and can’t be erased.`, undefined, { code: 'PRIVACY_PROTECTED_TENANT' });
    }
    if (await this.store.hasOpen(t.id, input.requestType)) {
      throw new ConflictError('This company already has an open request of this type.', undefined, { code: 'PRIVACY_REQUEST_OPEN' });
    }
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.create(input));
    return this.get(id);
  }

  async verify(admin: AdminSession, meta: RequestMeta, id: string): Promise<PrivacyRequest> {
    const r = await this.get(id);
    if (r.step !== 'RECEIVED') throw stepOrder(`${r.docNo} is already ${r.step.toLowerCase()}.`);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.verify(id));
    return this.get(id);
  }

  /**
   * EXPORT: one approval. DELETE: the typed company code on every approval; the second approver must differ — unless
   * the admin is the only staff member, when one call with a note records a solo approval (both approvers).
   */
  async approve(admin: AdminSession, meta: RequestMeta, id: string, input: PrivacyApprove): Promise<PrivacyRequest> {
    const staff = staffOf(admin);
    const r = await this.get(id);
    if (r.step !== 'VERIFIED') throw stepOrder(r.step === 'RECEIVED' ? 'Verify the requester’s identity first.' : `${r.docNo} is ${r.step.toLowerCase()}.`);
    let note = input.note ?? null;
    if (r.requestType === 'DELETE') {
      if (isProtectedTenant(r.tenantCode)) throw new ForbiddenError('This company is protected and can’t be erased.', undefined, { code: 'PRIVACY_PROTECTED_TENANT' });
      if (!codeMatches(input.confirmCode, r.tenantCode)) throw confirmCode(r.tenantCode);
      const solo = await this.store.isSolo();
      const firstIsMe = r.approvals === 1 && (await this.firstApproverIs(id, staff));
      if (solo) {
        // the only staff member: one approval with the typed code and a note counts for both approvers
        const d = soloDecision({ actorIsRequester: true, soloStaff: true, note, typed: input.confirmCode, expected: r.tenantCode, noteRequired: true });
        if (!d.ok) throw new ValidationError(d.message, { note: ['Add a note'] }, { code: d.code });
        note = d.note;
      } else if (firstIsMe) {
        throw new ForbiddenError('A second, different platform admin must approve this deletion.', undefined, { code: 'FOUR_EYES_REQUIRED' });
      }
    }
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.approve(id, note));
    return this.get(id);
  }

  async reject(admin: AdminSession, meta: RequestMeta, id: string, reason: string): Promise<PrivacyRequest> {
    const r = await this.get(id);
    if (!['RECEIVED', 'VERIFIED', 'APPROVED'].includes(r.step)) throw stepOrder(`${r.docNo} is ${r.step.toLowerCase()} and can no longer be rejected.`);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.reject(id, reason));
    return this.get(id);
  }

  /** Runs an approved request: EXPORT starts the tenant export; DELETE (typed code) erases the company's personal data. */
  async fulfil(admin: AdminSession, meta: RequestMeta, id: string, typed: string | undefined): Promise<PrivacyRequest> {
    staffOf(admin);
    const r = await this.get(id);
    if (r.step !== 'APPROVED') throw stepOrder(r.step === 'PROCESSING' ? `${r.docNo} is already running.` : `Approve ${r.docNo} first.`);
    if (r.requestType === 'EXPORT') {
      await this.backups.exportTenant(admin, meta, { id: r.tenantId, code: r.tenantCode }, {
        inTransaction: (runId) => this.store.startExport(id, runId),
        onFinish: async () => {
          const step = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.fulfilExport(id));
          this.logger.log(`${r.docNo} export finished: ${step}`);
        },
      });
      return this.get(id);
    }
    if (isProtectedTenant(r.tenantCode)) throw new ForbiddenError('This company is protected and can’t be erased.', undefined, { code: 'PRIVACY_PROTECTED_TENANT' });
    if (!codeMatches(typed, r.tenantCode)) throw confirmCode(r.tenantCode);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.fulfilDelete(id, typed!));
    return this.get(id);
  }

  /** The export file while its link is valid (7 days). */
  async exportFile(id: string): Promise<{ location: string; filename: string }> {
    const r = await this.get(id);
    if (r.requestType !== 'EXPORT') throw new NotFoundError('This request has no export');
    if (!r.exportAvailable) throw new ConflictError('This export is no longer available.', undefined, { code: 'PRIVACY_EXPORT_EXPIRED' });
    const runId = (await this.store.refs(id))?.exportBackupRunId;
    const run = runId ? await this.backups.fileOf(runId) : null;
    if (!run || run.status !== 'COMPLETED') throw new ConflictError('This export is no longer available.', undefined, { code: 'PRIVACY_EXPORT_EXPIRED' });
    return { location: run.location, filename: `${r.tenantCode}-${r.docNo}-export.json` };
  }

  /** Completion certificate (a print view in the console). */
  async certificate(admin: AdminSession, id: string): Promise<PrivacyCertificate> {
    const r = await this.get(id);
    if (r.step !== 'DONE' || !r.certificateRef) throw stepOrder(`${r.docNo} is not complete yet.`);
    return { request: r, issuedAt: r.completedAt!, issuedBy: admin.name ?? admin.email };
  }

  private async firstApproverIs(id: string, staff: string) {
    return (await this.store.refs(id))?.approver1StaffId === staff;
  }
}

function staffOf(admin: AdminSession): string {
  if (!admin.staffId) throw new ForbiddenError('Your admin account has no platform staff record yet. Sign in again.');
  return admin.staffId;
}
