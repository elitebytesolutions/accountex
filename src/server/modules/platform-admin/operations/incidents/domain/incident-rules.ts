/** Service incident rules (Phase 43). Pure. */

export const INCIDENT_STAGE_ORDER = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'] as const;

/** An update moves the incident forward (or keeps its stage); a resolved incident takes no more updates. */
export function stageMoveError(from: string, to: string): { code: 'INCIDENT_RESOLVED' | 'INCIDENT_STAGE_ORDER'; message: string } | null {
  if (from === 'RESOLVED') return { code: 'INCIDENT_RESOLVED', message: 'This incident is resolved. Only its post-mortem can change.' };
  const a = INCIDENT_STAGE_ORDER.indexOf(from as never), b = INCIDENT_STAGE_ORDER.indexOf(to as never);
  if (b < 0 || b < a) return { code: 'INCIDENT_STAGE_ORDER', message: 'An incident moves forward: Investigating, Identified, Monitoring, Resolved.' };
  return null;
}

/** Minutes from start to resolution (or to now while open). */
export const durationMinutes = (startedAt: Date, resolvedAt: Date | null, now = new Date()) =>
  Math.max(0, Math.round(((resolvedAt ?? now).getTime() - startedAt.getTime()) / 60_000));

/**
 * A component's state now: an open public incident on it is an outage (CRITICAL) or degradation (MINOR / MAJOR);
 * otherwise a maintenance window in progress; otherwise operational.
 */
export function componentState(component: string, open: { impact: string; components: string[] }[], inMaintenance: boolean): 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'MAINTENANCE' {
  const hits = open.filter((i) => i.components.includes(component));
  if (hits.some((i) => i.impact === 'CRITICAL')) return 'OUTAGE';
  if (hits.length) return 'DEGRADED';
  return inMaintenance ? 'MAINTENANCE' : 'OPERATIONAL';
}
