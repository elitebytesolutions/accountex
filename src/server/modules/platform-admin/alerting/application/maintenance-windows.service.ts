import { Injectable } from '@nestjs/common';
import {
  MAINTENANCE_OPEN_STATUSES,
  type AdminSession,
  type AlertRuleVersion,
  type MaintenanceWindow,
  type MaintenanceWindowCreate,
  type MaintenanceWindowUpdate,
} from '../../../../../shared/index.js';
import { adminActorContext } from '../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { MaintenanceWindowStore } from './alerting-stores.js';

/** A scheduled window that has started shows as in progress, one that has ended as completed (stored status unchanged). */
const live = (w: MaintenanceWindow, now = Date.now()): MaintenanceWindow =>
  w.status !== 'SCHEDULED' ? w
  : new Date(w.endsAt).getTime() <= now ? { ...w, status: 'COMPLETED' }
  : new Date(w.startsAt).getTime() <= now ? { ...w, status: 'IN_PROGRESS' }
  : w;

/** Maintenance windows (Status & Incidents › Schedule maintenance). Overlapping windows are allowed. */
@Injectable()
export class MaintenanceWindowsService {
  constructor(
    private readonly store: MaintenanceWindowStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(upcomingOnly: boolean) {
    return (await this.store.list(upcomingOnly)).map((w) => live(w));
  }

  async get(id: string) {
    const w = await this.store.get(id);
    if (!w) throw new NotFoundError('Maintenance window not found');
    return live(w);
  }

  async create(admin: AdminSession, meta: RequestMeta, input: MaintenanceWindowCreate) {
    if (new Date(input.endsAt).getTime() <= Date.now()) throw new ValidationError('The window must end in the future', { endsAt: ['The window must end in the future'] });
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...input, status: 'SCHEDULED' }));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: MaintenanceWindowUpdate) {
    const cur = await this.open(id);
    if (cur.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this window. Reload and try again.');
    const startsAt = input.startsAt ?? cur.startsAt, endsAt = input.endsAt ?? cur.endsAt;
    if (new Date(endsAt) <= new Date(startsAt)) throw new ValidationError('The window must end after it starts', { endsAt: ['The window must end after it starts'] });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...stripUndefined(input), id }));
    return this.get(id);
  }

  async cancel(admin: AdminSession, meta: RequestMeta, id: string, input: AlertRuleVersion) {
    const cur = await this.open(id);
    if (cur.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this window. Reload and try again.');
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion: input.rowVersion, status: 'CANCELLED' }));
    return this.get(id);
  }

  private async open(id: string) {
    const w = await this.store.get(id);
    if (!w) throw new NotFoundError('Maintenance window not found');
    if (!MAINTENANCE_OPEN_STATUSES.includes(live(w).status) || new Date(w.endsAt).getTime() <= Date.now())
      throw new ConflictError('Completed or cancelled maintenance windows can’t be changed.', undefined, { code: 'MAINTENANCE_WINDOW_CLOSED' });
    return w;
  }
}

const stripUndefined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
