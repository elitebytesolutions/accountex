import type { ActiveIncident, Incident, IncidentDeclare, IncidentPostUpdate, StatusComponentDay } from '../../../../../../shared/index.js';

/** Port: Platform.ServiceIncidents + ServiceIncidentUpdates and the status page view (Phase 43). */
export abstract class IncidentStore {
  /** Incidents started in the last `days` days, plus every open one, newest first, with their updates. */
  abstract list(days: number): Promise<Incident[]>;
  abstract get(id: string): Promise<Incident | null>;
  /** Platform.serviceIncidentDeclare: the incident (INC-YYYY-NNN) and its first update. Returns the id. */
  abstract declare(input: IncidentDeclare): Promise<string>;
  /** Platform.serviceIncidentPostUpdate: appends an update; the incident takes its stage. */
  abstract postUpdate(id: string, input: IncidentPostUpdate): Promise<void>;
  /** Platform.serviceIncidentAddUpdate: post-mortem reference / due date. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Open public incidents (the workspace banner). */
  abstract openPublic(): Promise<ActiveIncident[]>;
  /** View Platform.getStatusComponentHistory: 90 days × 8 components. */
  abstract componentHistory(): Promise<(StatusComponentDay & { component: string; name: string; sortOrder: number })[]>;
  /** Components under a maintenance window right now. */
  abstract inMaintenance(): Promise<Set<string>>;
}
