import { Injectable } from '@nestjs/common';
import {
  type AdminSession, type LeadActivityInput, type LeadBoard, type LeadCreate, type LeadDetail, type LeadListQuery, type LeadMove, type LeadUpdate,
  type TenantOnboard, type TenantOnboardResult,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { TenantsService } from '../../../tenants/tenants/application/tenants.service.js';
import { boardPosition, renumber, topPosition } from '../domain/board-position.js';
import { LeadStore } from './lead-store.js';

const stale = () => new ConcurrencyError('Someone else changed this lead. Reload and try again.');
const converted = () => new ConflictError('This lead has already been converted to a company.', undefined, { code: 'LEAD_ALREADY_CONVERTED' });

/**
 * Leads CRM (Super Admin › Growth › Leads CRM): the board, lead CRUD (soft delete), drag-and-drop stage moves with a
 * STAGE_CHANGE activity each, hand-logged activities, and conversion: the Phase 40 onboarding provisions the company,
 * then the lead is linked to it (PAID).
 */
@Injectable()
export class LeadsService {
  constructor(
    private readonly store: LeadStore,
    private readonly tenants: TenantsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async board(q: LeadListQuery): Promise<LeadBoard> {
    const [items, pipeline, staff] = await Promise.all([this.store.list(q), this.store.pipeline(), this.store.staff()]);
    return { items, pipeline, staff };
  }

  async get(id: string): Promise<LeadDetail> {
    const lead = await this.store.get(id);
    if (!lead) throw new NotFoundError('Lead not found');
    return { ...lead, activities: await this.store.activities(id) };
  }

  private async checkRefs(input: { source?: string; partnerId?: string | null; planInterestId?: string | null; ownerStaffId?: string }) {
    if (input.source === 'PARTNER' && !input.partnerId) {
      throw new ValidationError('Choose the partner for a partner-sourced lead.', { partnerId: ['Required for partner leads'] }, { code: 'LEAD_PARTNER_REQUIRED' });
    }
    if (input.partnerId && !(await this.store.partnerExists(input.partnerId))) throw new ValidationError('Choose a partner', { partnerId: ['Unknown partner'] });
    if (input.planInterestId && !(await this.store.planExists(input.planInterestId))) throw new ValidationError('Choose a plan', { planInterestId: ['Unknown plan'] });
    if (input.ownerStaffId && !(await this.store.staffExists(input.ownerStaffId))) throw new ValidationError('Choose the owner', { ownerStaffId: ['Unknown staff member'] });
  }

  async create(admin: AdminSession, meta: RequestMeta, input: LeadCreate): Promise<LeadDetail> {
    await this.checkRefs(input);
    const position = topPosition(await this.store.column('LEAD'));
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const leadId = await this.store.save({ ...input, partnerId: input.source === 'PARTNER' ? input.partnerId : null, stage: 'LEAD', boardPosition: position });
      await this.store.addActivity({ leadId, activityType: 'CREATED', note: null, staffUserId: admin.staffId });
      return leadId;
    });
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: LeadUpdate): Promise<LeadDetail> {
    const lead = await this.get(id);
    if (lead.rowVersion !== input.rowVersion) throw stale();
    const data = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const source = (data.source as string | undefined) ?? lead.source;
    const partnerId = 'partnerId' in data ? (data.partnerId as string | null) : lead.partnerId;
    await this.checkRefs({ source, partnerId, planInterestId: data.planInterestId as string | null | undefined, ownerStaffId: data.ownerStaffId as string | undefined });
    if (source !== 'PARTNER' && partnerId) data.partnerId = null;
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...data, id }));
    return this.get(id);
  }

  /** Soft delete: the lead leaves the board, its row and activities stay (with their history). */
  async remove(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const lead = await this.get(id);
    if (lead.rowVersion !== rowVersion) throw stale();
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, deletedAt: new Date().toISOString() }));
  }

  /** Drag & drop: the new column and place; a stage change writes a STAGE_CHANGE activity (Platform.leadMoveStage). */
  async move(admin: AdminSession, meta: RequestMeta, id: string, input: LeadMove): Promise<LeadDetail> {
    const lead = await this.get(id);
    if (lead.rowVersion !== input.rowVersion) throw stale();
    if (lead.tenantId && input.stage !== lead.stage && input.stage !== 'CHURNED') throw converted();
    const column = (await this.store.column(input.stage)).filter((c) => c.id !== id);
    let position = boardPosition(column, input.beforeId);
    const spaced = position === null ? renumber(column) : null;
    if (spaced) position = boardPosition(spaced, input.beforeId);
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      if (spaced) await this.store.setPositions(spaced);
      await this.store.move({
        leadId: id, toStage: input.stage, boardPosition: position ?? 0, note: input.note, lostReason: input.lostReason,
        staffUserId: admin.staffId, rowVersion: input.rowVersion,
      });
    });
    return this.get(id);
  }

  async addActivity(admin: AdminSession, meta: RequestMeta, id: string, input: LeadActivityInput): Promise<LeadDetail> {
    await this.get(id);
    await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.addActivity({ leadId: id, activityType: input.activityType, note: input.note, staffUserId: admin.staffId }));
    return this.get(id);
  }

  /**
   * Convert: the onboarding wizard's input provisions the company (Phase 40 TenantsService.onboard, its own
   * transactions), then the lead is linked to it. If linking fails the company still exists and the error says so.
   */
  async convert(admin: AdminSession, meta: RequestMeta, id: string, input: TenantOnboard): Promise<TenantOnboardResult & { leadId: string }> {
    const lead = await this.get(id);
    if (lead.tenantId) throw converted();
    const result = await this.tenants.onboard(admin, meta, input);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.convert(id, result.tenant.id, admin.staffId));
    return { ...result, leadId: id };
  }
}
