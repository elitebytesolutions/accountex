import { z } from 'zod';
import { patchFields } from '../common/list-query.ts';
import { money, optDate, optId, optInt, optText, rowVersion } from './fields.ts';

/**
 * Phase 42: Leads CRM (Platform.PlatformLeads + PlatformLeadActivities). A lead moves LEAD → DEMO → TRIAL → PAID
 * (or CHURNED) on a drag-and-drop board; every stage change writes an activity. Converting a lead runs the Phase 40
 * onboarding and links the new company (tenantId). Delete is soft (deletedAt).
 */
export const LEAD_STAGES = ['LEAD', 'DEMO', 'TRIAL', 'PAID', 'CHURNED'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const LEAD_SOURCES = ['WEBSITE', 'REFERRAL', 'PARTNER', 'FACEBOOK', 'LINKEDIN', 'EXPO'] as const;
/** Activities a person logs by hand (CREATED and STAGE_CHANGE are written by the system). */
export const LEAD_LOG_TYPES = ['NOTE', 'CALL', 'EMAIL', 'DEMO'] as const;

export type LeadActivity = {
  id: string; activityType: string; fromStage: string | null; toStage: string | null; note: string | null; staffName: string | null; occurredAt: string;
};
export type Lead = {
  id: string; companyName: string; contactPerson: string | null; phone: string | null; email: string | null; city: string | null;
  source: string; partnerId: string | null; partnerName: string | null; ownerStaffId: string; ownerName: string;
  planInterestId: string | null; planCode: string | null; planName: string | null; expectedMrr: number;
  stage: string; boardPosition: number; notes: string | null; demoAt: string | null; trialStartedOn: string | null; trialEndsOn: string | null;
  trialEngagementScore: number | null; wonAt: string | null; churnedAt: string | null; lostReason: string | null;
  tenantId: string | null; tenantCode: string | null; tenantName: string | null; createdAt: string; updatedAt: string; rowVersion: number;
};
export type LeadDetail = Lead & { activities: LeadActivity[] };
/** One stage of Platform.getPlatformLeadPipeline (counts, MRR, reached-this-stage, step conversion). */
export type LeadPipelineStage = {
  stage: string; stageOrder: number; currentCount: number; currentValue: number; reached: number; stepConversionPct: number | null;
};
export type LeadBoard = {
  items: Lead[];
  pipeline: { stages: LeadPipelineStage[]; winRatePct: number | null; pipelineValue: number };
  staff: { id: string; name: string }[];
};

type LeadShape = { source?: string; partnerId?: string | null };
/** A partner-sourced lead names its partner (leadPartnerSourceChk). */
export function leadErrors(l: LeadShape): Record<string, string> {
  return l.source === 'PARTNER' && !l.partnerId ? { partnerId: 'Choose the partner who referred this lead' } : {};
}

const Fields = {
  companyName: z.string().trim().min(2, 'Name the company').max(160),
  contactPerson: optText(120),
  phone: optText(40),
  email: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.email('Use a valid email').max(160).nullable()),
  city: optText(80),
  source: z.enum(LEAD_SOURCES).default('WEBSITE'),
  partnerId: optId,
  ownerStaffId: z.uuid('Choose the owner'),
  planInterestId: optId,
  expectedMrr: money().default(0),
  notes: optText(2000),
  demoAt: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.iso.datetime({ offset: true, message: 'Pick a date and time' }).nullable()),
  trialEngagementScore: optInt(0, 100),
};
/** The partner rule (leadErrors) is checked by the server with its own code, LEAD_PARTNER_REQUIRED. */
export const LeadCreateSchema = z.object(Fields);
export type LeadCreate = z.infer<typeof LeadCreateSchema>;
export const LeadUpdateSchema = patchFields(Fields).extend({ rowVersion, trialEndsOn: optDate.optional() });
export type LeadUpdate = z.infer<typeof LeadUpdateSchema>;

export const LeadMoveSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  /** Drop before this lead (same column); omitted = the end of the column. */
  beforeId: optId.optional(),
  note: optText(500),
  lostReason: optText(200),
  rowVersion,
});
export type LeadMove = z.infer<typeof LeadMoveSchema>;

export const LeadActivityInputSchema = z.object({
  activityType: z.enum(LEAD_LOG_TYPES).default('NOTE'),
  note: z.string().trim().min(2, 'Write the note').max(2000),
});
export type LeadActivityInput = z.infer<typeof LeadActivityInputSchema>;

export const LeadDeleteSchema = z.object({ rowVersion });
export const LeadListQuerySchema = z.object({ search: z.string().trim().max(100).optional(), ownerStaffId: z.uuid().optional() });
export type LeadListQuery = z.infer<typeof LeadListQuerySchema>;

/** Lookup types the leads screens read (source, stage and activity labels / tones). */
export const LEAD_LOOKUPS = ['PlatformLeadSource', 'PlatformLeadStage', 'PlatformLeadActivityType'];
