import { z } from 'zod';
import { optDate, rowVersion } from './fields.ts';
import { MAINTENANCE_COMPONENTS } from './maintenance.ts';

/**
 * Phase 43: service incidents (Platform.ServiceIncidents + ServiceIncidentUpdates): the incident part of Status &
 * Incidents, the public status page (90-day component bars) and the workspace banner data.
 * The stage only moves forward; RESOLVED stamps resolvedAt. The update timeline is append-only.
 */
export const INCIDENT_STAGES = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'] as const;
export type IncidentStage = (typeof INCIDENT_STAGES)[number];
export const INCIDENT_IMPACTS = ['MINOR', 'MAJOR', 'CRITICAL'] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];
const COMPONENT_CODES = MAINTENANCE_COMPONENTS.map((c) => c.code) as [string, ...string[]];

export type IncidentUpdate = {
  id: string; stage: string; message: string; postedAt: string; postedBy: string | null; notifySubscribers: boolean; updateBanner: boolean;
};
export type Incident = {
  id: string; docNo: string; title: string; impact: string; components: string[]; stage: string; startedAt: string; resolvedAt: string | null;
  isPublic: boolean; declaredBy: string | null; postmortemDueOn: string | null; postmortemRef: string | null;
  /** Start to resolution (or now while open), in minutes. */
  durationMinutes: number; createdAt: string; rowVersion: number; updates: IncidentUpdate[];
};

/** One component-day of the 90-day status bars (view Platform.getStatusComponentHistory, public incidents only). */
export type StatusComponentDay = { day: string; worstImpact: 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL'; incidentCount: number; inMaintenance: boolean; uptimePct: number };
export type StatusComponent = {
  component: string; name: string; uptimePct: number;
  /** Now: an open public incident on it (degraded / outage) or a maintenance window in progress. */
  current: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'MAINTENANCE';
  days: StatusComponentDay[];
};
/** An open public incident, as the workspace banner shows it (GET /api/status/active-incidents). */
export type ActiveIncident = { id: string; docNo: string; title: string; impact: string; stage: string; components: string[]; startedAt: string };
/** GET /api/status/components and GET /api/admin/incidents/status: the public status page. */
export type StatusPage = { components: StatusComponent[]; uptimePct: number; openIncidents: ActiveIncident[]; updatedAt: string };

export const IncidentDeclareSchema = z.object({
  title: z.string().trim().min(3, 'Give it a title').max(160),
  impact: z.enum(INCIDENT_IMPACTS).default('MINOR'),
  components: z.array(z.enum(COMPONENT_CODES)).min(1, 'Pick affected components').max(8),
  stage: z.enum(['INVESTIGATING', 'IDENTIFIED']).default('INVESTIGATING'),
  message: z.string().trim().min(1, 'What are tenants seeing?').max(2000),
  isPublic: z.boolean().default(true),
  notifySubscribers: z.boolean().default(true),
  updateBanner: z.boolean().default(true),
});
export type IncidentDeclare = z.infer<typeof IncidentDeclareSchema>;

export const IncidentPostUpdateSchema = z.object({
  stage: z.enum(INCIDENT_STAGES),
  message: z.string().trim().min(1, 'Write a short update first').max(2000),
  notifySubscribers: z.boolean().default(true),
  updateBanner: z.boolean().default(true),
});
export type IncidentPostUpdate = z.infer<typeof IncidentPostUpdateSchema>;

export const IncidentPostmortemSchema = z.object({
  postmortemRef: z.string().trim().min(3, 'Link or reference of the post-mortem').max(300),
  postmortemDueOn: optDate.optional(),
  rowVersion,
});
export type IncidentPostmortem = z.infer<typeof IncidentPostmortemSchema>;

export const IncidentListQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(90) });
export type IncidentListQuery = z.infer<typeof IncidentListQuerySchema>;
