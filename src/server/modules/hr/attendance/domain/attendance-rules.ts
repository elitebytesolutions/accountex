import { distanceM, type Geofence } from '../../../../../shared/index.js';

/**
 * Pure attendance rules (no framework, no database). The day's status itself is built by the database
 * (HumanResources.attendanceRegisterBuild) so the register, the nightly run and payroll share one rule set.
 */

/** Where a self-service punch was made relative to the branch geofence (Q30-4: no coordinates → no geofence, accepted). */
export function geofenceCheck(fence: Geofence, lat: number, lng: number) {
  if (!fence) return { distanceM: null, inside: null, label: 'No geofence set for the branch' };
  const d = distanceM(fence.latitude, fence.longitude, lat, lng);
  const inside = d <= fence.radiusM;
  return { distanceM: d, inside, label: inside ? `${fence.branch} · within geofence` : `${fence.branch} · ${d.toLocaleString('en-PK')} m from the geofence centre` };
}

/** An office punch must be inside the geofence (when the branch has one); WFH and field punches are accepted anywhere. */
export function geofenceRefusal(workMode: string, inside: boolean | null, distance: number | null, radius: number | null): string | null {
  if (workMode !== 'OFFICE' || inside !== false) return null;
  return `You are ${(distance! - (radius ?? 0)).toLocaleString('en-PK')} m outside the office geofence. Check in as work from home or field visit instead.`;
}

/** AUTO punches alternate: in when the day has no open check-in, else out. */
export function nextDirection(punches: { direction: string }[]): 'IN' | 'OUT' {
  const last = punches.at(-1);
  return !last || last.direction === 'OUT' ? 'IN' : 'OUT';
}

/** Days from the first of a month to a last date (inclusive), never after `until`. */
export function processDays(month: string, until: string): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).filter((d) => d <= until);
}
