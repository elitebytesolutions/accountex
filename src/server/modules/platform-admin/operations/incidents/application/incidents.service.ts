import { Injectable } from '@nestjs/common';
import type {
  ActiveIncident, AdminSession, Incident, IncidentDeclare, IncidentPostmortem, IncidentPostUpdate, StatusComponent, StatusPage,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../../core/domain/errors.js';
import { componentState, stageMoveError } from '../domain/incident-rules.js';
import { IncidentStore } from './incident-store.js';

/**
 * Service incidents (Status & Incidents): declare → updates (stage forward only) → resolved → post-mortem, and the
 * public status page. Every write runs in the Super Admin's audit context (platform history).
 */
@Injectable()
export class IncidentsService {
  constructor(
    private readonly store: IncidentStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(days: number) {
    return this.store.list(days);
  }

  async get(id: string): Promise<Incident> {
    const i = await this.store.get(id);
    if (!i) throw new NotFoundError('Incident not found');
    return i;
  }

  async declare(admin: AdminSession, meta: RequestMeta, input: IncidentDeclare): Promise<Incident> {
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.declare(input));
    return this.get(id);
  }

  async postUpdate(admin: AdminSession, meta: RequestMeta, id: string, input: IncidentPostUpdate): Promise<Incident> {
    const cur = await this.get(id);
    const err = stageMoveError(cur.stage, input.stage);
    if (err) throw new ConflictError(err.message, undefined, { code: err.code });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.postUpdate(id, input));
    return this.get(id);
  }

  /** The post-mortem reference of a resolved incident (template "Write post-mortem"). */
  async postmortem(admin: AdminSession, meta: RequestMeta, id: string, input: IncidentPostmortem): Promise<Incident> {
    const cur = await this.get(id);
    if (cur.stage !== 'RESOLVED') throw new ConflictError('Resolve the incident before writing its post-mortem.', undefined, { code: 'INCIDENT_STAGE_ORDER' });
    if (cur.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this incident. Reload and try again.');
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({
      id, rowVersion: input.rowVersion, postmortemRef: input.postmortemRef, ...(input.postmortemDueOn !== undefined && { postmortemDueOn: input.postmortemDueOn }),
    }));
    return this.get(id);
  }

  /** Open public incidents, as the workspace banner (Phase 42) shows them. */
  activeIncidents(): Promise<ActiveIncident[]> {
    return this.store.openPublic();
  }

  /** The public status page: 90-day bars per component, uptime and what is open now. */
  async statusPage(): Promise<StatusPage> {
    const [rows, open, maint] = await Promise.all([this.store.componentHistory(), this.store.openPublic(), this.store.inMaintenance()]);
    const byComp = new Map<string, typeof rows>();
    for (const r of rows) byComp.set(r.component, [...(byComp.get(r.component) ?? []), r]);
    const components: StatusComponent[] = [...byComp.values()]
      .sort((a, b) => a[0]!.sortOrder - b[0]!.sortOrder)
      .map((days) => {
        const c = days[0]!;
        const uptime = days.reduce((t, d) => t + d.uptimePct, 0) / days.length;
        return {
          component: c.component, name: c.name, uptimePct: Math.round(uptime * 100) / 100,
          current: componentState(c.component, open, maint.has(c.component)),
          days: days.map(({ day, worstImpact, incidentCount, inMaintenance, uptimePct }) => ({ day, worstImpact, incidentCount, inMaintenance, uptimePct })),
        };
      });
    const uptimePct = components.length ? Math.round((components.reduce((t, c) => t + c.uptimePct, 0) / components.length) * 100) / 100 : 100;
    return { components, uptimePct, openIncidents: open, updatedAt: new Date().toISOString() };
  }
}
