import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AdminSession, ChangeRequest, ChangeRequestCreate, ChangeRequestDecision, ChangeRequestList, ChangeRequestListQuery, FlagEnvironment, FlagScheduleInput,
  FlagScheduleStep, ScheduleRunResult,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type AuditContext, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { FlagsService } from '../../../flags/application/flags.service.js';
import { isDue, scheduleErrors, todayPk } from '../domain/rollout-schedule.js';
import { soloDecision } from '../domain/solo-approval.js';
import { ChangeRequestStore, type StoredChangeRequest } from './change-request-store.js';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/**
 * Flag change requests (Feature Management › Change Requests): a Production toggle or targeting save becomes a request;
 * a second admin (or, while there is only one, the requester with the typed key and a note) approves it, which applies
 * it at once or once applyNotBefore has passed; rejections and applications are logged in FlagAuditLogs with the
 * request id. Scheduled rollout steps open a request on their date (runSchedule, run hourly by the ops job).
 */
@Injectable()
export class ChangeRequestsService {
  private readonly logger = new Logger('ChangeRequests');

  constructor(
    private readonly store: ChangeRequestStore,
    private readonly flags: FlagsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(admin: AdminSession, q: ChangeRequestListQuery): Promise<ChangeRequestList> {
    const [items, kpis, solo] = await Promise.all([this.store.list(q), this.store.kpis(), this.store.isSolo()]);
    return { items, kpis, solo, meStaffId: admin.staffId };
  }

  async get(id: string): Promise<StoredChangeRequest> {
    const cr = await this.store.get(id);
    if (!cr) throw new NotFoundError('Change request not found');
    return cr;
  }

  /** "Request change" from a flag edit (Production). Validated and diffed now; applied on approval. */
  async create(admin: AdminSession, meta: RequestMeta, input: ChangeRequestCreate): Promise<ChangeRequest> {
    staffOf(admin);
    if (input.environment !== 'PRODUCTION') throw new ValidationError('Only Production changes need a change request', { environment: ['Production only'] });
    const plan = await this.flags.previewChange(input.flagId, input.environment, input.change);
    if (JSON.stringify(plan.before) === JSON.stringify(plan.after)) throw new ValidationError('Nothing changes: the flag already looks like this');
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.submit({
      flagId: input.flagId, environment: input.environment, reason: input.reason, summary: plan.summary, beforeState: plan.before, afterState: plan.after,
      patch: plan.patch, applyNotBefore: input.applyNotBefore ?? null, source: 'MANUAL',
    }));
    return this.get(id);
  }

  async comment(admin: AdminSession, meta: RequestMeta, id: string, body: string): Promise<ChangeRequest> {
    const staff = staffOf(admin);
    await this.get(id);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.comment(id, staff, body));
    return this.get(id);
  }

  /** Approve & apply (now, or once applyNotBefore has passed). Solo approval: typed flag key + note. */
  async approve(admin: AdminSession, meta: RequestMeta, id: string, input: ChangeRequestDecision): Promise<ChangeRequest> {
    const cr = await this.pending(id);
    const note = await this.decisionNote(admin, cr, input);
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      await this.store.decide(id, true, note);
      if (!cr.applyNotBefore || new Date(cr.applyNotBefore).getTime() <= Date.now()) await this.apply(cr);
    });
    return this.get(id);
  }

  async reject(admin: AdminSession, meta: RequestMeta, id: string, input: ChangeRequestDecision): Promise<ChangeRequest> {
    const cr = await this.pending(id);
    const note = await this.decisionNote(admin, cr, input);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.decide(id, false, note));
    return this.get(id);
  }

  /** Withdraw a pending request (or an approved one still waiting for its time). */
  async cancel(admin: AdminSession, meta: RequestMeta, id: string, reason: string | undefined): Promise<ChangeRequest> {
    const cr = await this.get(id);
    if (!(cr.status === 'PENDING' || (cr.status === 'APPROVED' && !cr.appliedAt))) throw notPending(cr.docNo);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.cancel(id, reason ?? null));
    return this.get(id);
  }

  // ---- scheduled rollout steps

  schedule(flagId: string, env: FlagEnvironment): Promise<FlagScheduleStep[]> {
    return this.store.schedule(flagId, env);
  }

  /** PUT the ramp plan of one environment: PLANNED steps are replaced; requested / applied steps stay as they are. */
  async saveSchedule(admin: AdminSession, meta: RequestMeta, flagId: string, env: FlagEnvironment, input: FlagScheduleInput): Promise<FlagScheduleStep[]> {
    const flag = await this.flags.get(flagId);
    if (flag.stage === 'ARCHIVED') throw new ConflictError('This flag is archived. Restore it before changing it.', undefined, { code: 'FLAG_ARCHIVED' });
    const state = flag.environments.find((e) => e.environment === env);
    if (flag.flagType === 'ENTITLEMENT' || state?.defaultRule?.defaultRule !== 'ROLLOUT') {
      throw new ValidationError('Scheduled ramps are for percentage rollouts. This flag is plan or switch based.', undefined, { code: 'SCHEDULE_INVALID' });
    }
    const current = await this.store.schedule(flagId, env);
    const locked = current.filter((s) => s.status !== 'PLANNED').map((s) => ({ id: s.id, stepDate: s.stepDate }));
    const steps = input.steps.filter((s) => !s.id || !locked.some((l) => l.id === s.id));
    const unknown = steps.find((s) => s.id && !current.some((c) => c.id === s.id));
    if (unknown) throw new NotFoundError('Ramp step not found');
    const errs = scheduleErrors(input.steps, todayPk(), locked);
    if (Object.keys(errs).length) throw new ValidationError('Check the ramp steps', Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, [v]])), { code: 'SCHEDULE_INVALID' });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.saveSchedule(flagId, env, steps));
    return this.store.schedule(flagId, env);
  }

  /** "Run now" (Super Admin) / the ops job: due approved requests are applied, due ramp steps open a request. */
  runNow(admin: AdminSession, meta: RequestMeta): Promise<ScheduleRunResult> {
    return this.runSchedule(adminActorContext(admin, meta));
  }

  async runSchedule(ctx: AuditContext): Promise<ScheduleRunResult> {
    const out: ScheduleRunResult = { requested: [], applied: [], skipped: [] };
    for (const cr of await this.store.dueApproved(new Date())) {
      try {
        await this.unitOfWork.run({ ...ctx, correlationId: ctx.correlationId || randomUUID() }, () => this.apply(cr));
        out.applied.push(cr.docNo);
      } catch (e) {
        out.skipped.push({ step: cr.docNo, reason: msg(e) });
      }
    }
    const today = todayPk();
    for (const s of await this.store.dueSteps(today)) {
      if (!isDue(s.stepDate, today)) continue;
      try {
        const docNo = await this.unitOfWork.run({ ...ctx, correlationId: ctx.correlationId || randomUUID() }, async () => {
          const plan = await this.flags.previewChange(s.flagId, s.environment as FlagEnvironment, { kind: 'ROLLOUT', rolloutPct: s.rolloutPct });
          const requester = (await this.store.isStaff(s.createdBy)) ? s.createdBy! : s.ownerStaffId;
          const id = await this.store.submit({
            flagId: s.flagId, environment: s.environment, reason: `Scheduled ramp step of ${s.stepDate}: rollout to ${s.rolloutPct}%`, summary: plan.summary,
            beforeState: plan.before, afterState: plan.after, patch: plan.patch, applyNotBefore: null, source: 'SCHEDULE_STEP', requesterStaffId: requester,
          });
          await this.store.markStepRequested(s.id, id);
          return (await this.store.get(id))!.docNo;
        });
        out.requested.push(docNo);
      } catch (e) {
        out.skipped.push({ step: `${s.stepDate} ${s.rolloutPct}%`, reason: msg(e) });
      }
    }
    if (out.requested.length || out.applied.length || out.skipped.length) this.logger.log(`Schedule run: ${JSON.stringify(out)}`);
    return out;
  }

  /** Applies an approved request (inside the caller's transaction) and logs CR_APPLIED with the request id. */
  private async apply(cr: StoredChangeRequest) {
    const r = await this.flags.applyChange(cr.flagId, cr.environment as FlagEnvironment, cr.patch, cr.beforeState);
    await this.store.markApplied(cr.id, `${cr.summary}`, r.before, r.after);
  }

  private async pending(id: string) {
    const cr = await this.get(id);
    if (cr.status !== 'PENDING') throw notPending(cr.docNo);
    return cr;
  }

  /** The note to store: four-eyes, or the solo approval (typed key + note, "SOLO APPROVAL:" prefix). */
  private async decisionNote(admin: AdminSession, cr: StoredChangeRequest, input: ChangeRequestDecision): Promise<string> {
    const staff = staffOf(admin);
    const r = soloDecision({
      actorIsRequester: cr.requesterStaffId === staff, soloStaff: await this.store.isSolo(), note: input.note, typed: input.confirmKey, expected: cr.flagKey, noteRequired: true,
    });
    if (!r.ok) {
      if (r.code === 'FOUR_EYES_REQUIRED') throw new ForbiddenError(r.message, undefined, { code: r.code });
      throw new ValidationError(r.message, r.code === 'SOLO_CONFIRM_REQUIRED' ? { confirmKey: ['Type the flag key'] } : { note: ['Add a note'] }, { code: r.code });
    }
    return r.note;
  }
}

const notPending = (docNo: string) => new ConflictError(`${docNo} is no longer pending.`, undefined, { code: 'CR_NOT_PENDING' });

function staffOf(admin: AdminSession): string {
  if (!admin.staffId) throw new ForbiddenError('Your admin account has no platform staff record yet. Sign in again.');
  return admin.staffId;
}
