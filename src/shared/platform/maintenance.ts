import { z } from 'zod';
import { issues, optText, rowVersion } from './fields.ts';

/**
 * Phase 39: maintenance windows (Platform.MaintenanceWindows): the "Schedule maintenance" form of Status & Incidents.
 * Overlapping windows are allowed (the status page shows both).
 */
export const MAINTENANCE_COMPONENTS = [
  { code: 'WEB_APP', label: 'Web app' },
  { code: 'PUBLIC_API', label: 'Public API' },
  { code: 'FBR_PRAL_GATEWAY', label: 'FBR / PRAL gateway' },
  { code: 'PRA_SRB_EINVOICING', label: 'PRA & SRB e-invoicing' },
  { code: 'PAYROLL_ENGINE', label: 'Payroll engine' },
  { code: 'EMAIL_SMS', label: 'Email & SMS delivery' },
  { code: 'BANK_FEEDS_RAAST', label: 'Bank feeds & Raast' },
  { code: 'BACKUPS_DR', label: 'Backups & DR' },
] as const;
const COMPONENT_CODES = MAINTENANCE_COMPONENTS.map((c) => c.code) as [string, ...string[]];
export const MAINTENANCE_LEAD_HOURS = [72, 24, 1] as const;
/** Windows that can still be edited or cancelled. */
export const MAINTENANCE_OPEN_STATUSES: readonly string[] = ['SCHEDULED', 'IN_PROGRESS'];

export type MaintenanceWindow = {
  id: string; title: string; message: string | null; startsAt: string; endsAt: string; components: string[];
  bannerLeadHours: number; readOnlyMode: boolean; status: string; createdAt: string; updatedAt: string; rowVersion: number;
};

type WindowShape = { startsAt?: string; endsAt?: string };
export function maintenanceErrors(w: WindowShape): Record<string, string> {
  if (!w.startsAt || !w.endsAt) return {};
  return new Date(w.endsAt) > new Date(w.startsAt) ? {} : { endsAt: 'The window must end after it starts' };
}

const Fields = {
  title: z.string().trim().min(2, 'Give it a title').max(120).default('Planned maintenance'),
  message: optText(1000),
  startsAt: z.iso.datetime({ offset: true, message: 'Pick a date and start time' }),
  endsAt: z.iso.datetime({ offset: true, message: 'Pick an end time' }),
  components: z.array(z.enum(COMPONENT_CODES)).min(1, 'Select at least one component').max(8),
  bannerLeadHours: z.union([z.literal(72), z.literal(24), z.literal(1)]).default(72),
  readOnlyMode: z.boolean().default(false),
};
export const MaintenanceWindowCreateSchema = z.object(Fields).superRefine(issues(maintenanceErrors));
export type MaintenanceWindowCreate = z.infer<typeof MaintenanceWindowCreateSchema>;
export const MaintenanceWindowUpdateSchema = z.object({
  title: Fields.title.unwrap().optional(),
  message: Fields.message,
  startsAt: Fields.startsAt.optional(),
  endsAt: Fields.endsAt.optional(),
  components: Fields.components.optional(),
  bannerLeadHours: z.union([z.literal(72), z.literal(24), z.literal(1)]).optional(),
  readOnlyMode: z.boolean().optional(),
  rowVersion,
}).superRefine(issues(maintenanceErrors));
export type MaintenanceWindowUpdate = z.infer<typeof MaintenanceWindowUpdateSchema>;
export const MaintenanceWindowListQuerySchema = z.object({ scope: z.enum(['upcoming', 'all']).default('upcoming') });
export type MaintenanceWindowListQuery = z.infer<typeof MaintenanceWindowListQuerySchema>;
