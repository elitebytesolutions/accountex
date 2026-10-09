import { Injectable } from '@nestjs/common';
import type {
  SessionUser, TrainingBoardQuery, TrainingComplete, TrainingEnrol, TrainingEnrolResult, TrainingEnrolmentItem, TrainingEnrolmentUpdate, TrainingSessionCreate,
  TrainingSessionItem, TrainingSessionUpdate,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { TrainingStore } from './training-store.js';

const OPEN = ['PLANNED', 'IN_PROGRESS'];
const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
const programClosed = () => new ConflictError('This programme is completed or cancelled.', undefined, { code: 'TRAINING_PROGRAM_CLOSED' });

/**
 * Training: sessions scheduled under a Phase 13 programme; employees enrolled at programme level (bulk, within the
 * programme's seats, once each); progress / score updates; completion (database) issues the programme's certification.
 */
@Injectable()
export class TrainingService {
  constructor(
    private readonly store: TrainingStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async board(user: SessionUser, q: TrainingBoardQuery) {
    return this.store.board(user.tenantId, q, await this.store.today(user.tenantId));
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async createSession(user: SessionUser, meta: RequestMeta, programId: string, input: TrainingSessionCreate): Promise<TrainingSessionItem> {
    const p = await this.store.program(user.tenantId, programId);
    if (!p || p.deleted) throw new NotFoundError('Training programme not found');
    if (!OPEN.includes(p.status)) throw programClosed();
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveSession(strip({ ...input, programId })));
    return (await this.store.session(user.tenantId, id))!;
  }

  async updateSession(user: SessionUser, meta: RequestMeta, id: string, input: TrainingSessionUpdate) {
    const s = await this.store.session(user.tenantId, id);
    if (!s) throw new NotFoundError('Session not found');
    if (s.status !== 'SCHEDULED') throw new ConflictError('This session is completed or cancelled.', undefined, { code: 'TALENT_STAGE_ORDER' });
    if (s.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this session. Reload and try again.');
    const starts = input.startsAt ?? s.startsAt, ends = input.endsAt ?? s.endsAt;
    if (Date.parse(ends) <= Date.parse(starts)) throw new ValidationError('Ends after it starts', { endsAt: ['Ends after it starts'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveSession(Object.fromEntries(Object.entries({ ...input, id }).filter(([, v]) => v !== undefined))));
    return (await this.store.session(user.tenantId, id))!;
  }

  /** Bulk enrolment: all or nothing. Already enrolled → 409; beyond the seats → 400. */
  async enrol(user: SessionUser, meta: RequestMeta, input: TrainingEnrol): Promise<TrainingEnrolResult> {
    const p = await this.store.program(user.tenantId, input.programId);
    if (!p || p.deleted) throw new NotFoundError('Training programme not found');
    if (!OPEN.includes(p.status)) throw programClosed();
    const employeeIds = [...new Set(input.employeeIds)];
    const dup = await this.store.enrolledAlready(user.tenantId, p.id, employeeIds);
    if (dup.length) throw new ConflictError(`${dup.map((d) => d.name).join(', ')} ${dup.length === 1 ? 'is' : 'are'} already enrolled in ${p.name}.`, { employeeIds: dup.map((d) => d.name) }, { code: 'TRAINING_ENROLMENT_EXISTS' });
    if (p.seats != null) {
      const taken = await this.store.activeEnrolments(user.tenantId, p.id);
      if (taken + employeeIds.length > p.seats) {
        throw new ValidationError(`Only ${Math.max(0, p.seats - taken)} of ${p.seats} seats are left in ${p.name}.`, { employeeIds: ['Not enough seats'] }, { code: 'TRAINING_SEATS_FULL' });
      }
    }
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const employeeId of employeeIds) await this.store.saveEnrolment(strip({ programId: p.id, employeeId, enrolledOn: input.enrolledOn }));
    });
    return { enrolled: employeeIds.length, skipped: [] };
  }

  async updateEnrolment(user: SessionUser, meta: RequestMeta, id: string, input: TrainingEnrolmentUpdate) {
    const e = await this.current(user, id, input.rowVersion);
    const { behind, ...fields } = input;
    const status = behind === true ? 'BEHIND' : behind === false && e.status === 'BEHIND' ? 'IN_PROGRESS' : undefined;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveEnrolment(Object.fromEntries(Object.entries({ ...fields, id, status }).filter(([, v]) => v !== undefined))));
    return (await this.store.enrolment(user.tenantId, id))!;
  }

  async complete(user: SessionUser, meta: RequestMeta, id: string, input: TrainingComplete) {
    await this.current(user, id, input.rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.completeEnrolment(id, input));
    return (await this.store.enrolment(user.tenantId, id))!;
  }

  async withdraw(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.withdrawEnrolment(id, rowVersion));
    return (await this.store.enrolment(user.tenantId, id))!;
  }

  private async current(user: SessionUser, id: string, rowVersion: number): Promise<TrainingEnrolmentItem> {
    const e = await this.store.enrolment(user.tenantId, id);
    if (!e) throw new NotFoundError('Enrolment not found');
    if (['COMPLETED', 'WITHDRAWN'].includes(e.status)) throw new ConflictError(`This enrolment is ${e.status.toLowerCase()}.`, undefined, { code: 'TALENT_STAGE_ORDER' });
    if (e.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this enrolment. Reload and try again.');
    return e;
  }
}
