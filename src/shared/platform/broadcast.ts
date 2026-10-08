import { z } from 'zod';
import { issues, optId, optText } from './fields.ts';

/**
 * Phase 42: broadcasts to a set of companies (Platform.TenantBroadcasts). The audience is resolved to companies
 * (a segment through Platform.evaluateTenantSegment), then one Platform.CommunicationLogs row is written per company
 * and channel. IN_APP messages are delivered at once as workspace notifications to the company's admins; EMAIL, SMS
 * and WHATSAPP rows stay QUEUED until email / SMS delivery exists (Phase 29).
 */
export const BROADCAST_AUDIENCES = ['ALL_ACTIVE', 'TRIALS', 'PAST_DUE', 'PLAN', 'REGION', 'ENTERPRISE_OWNERS', 'SEGMENT', 'SELECTED_TENANTS'] as const;
export const BROADCAST_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP'] as const;
export const BROADCAST_LANGUAGE_MODES = ['TENANT_PREFERENCE', 'EN', 'UR'] as const;
/** Estimated cost of one SMS segment (Rs), for the "SMS cost ≈" line. */
export const SMS_SEGMENT_COST = 0.62;

type Shape = { audience?: string; audienceValue?: string | null; segmentId?: string | null; tenantIds?: string[]; commTemplateId?: string | null; messageOverride?: string | null };
export function broadcastErrors(b: Shape): Record<string, string> {
  const e: Record<string, string> = {};
  if ((b.audience === 'PLAN' || b.audience === 'REGION') && !b.audienceValue) e.audienceValue = b.audience === 'PLAN' ? 'Choose the plan' : 'Choose the province';
  if (b.audience === 'SEGMENT' && !b.segmentId) e.segmentId = 'Choose the segment';
  if (b.audience === 'SELECTED_TENANTS' && !b.tenantIds?.length) e.tenantIds = 'Pick at least one company';
  if (!b.commTemplateId && !b.messageOverride) e.commTemplateId = 'Choose a template or write a message';
  return e;
}

export const BroadcastInputSchema = z.object({
  audience: z.enum(BROADCAST_AUDIENCES).default('ALL_ACTIVE'),
  /** PLAN: the plan code; REGION: the province. */
  audienceValue: optText(80),
  segmentId: optId,
  tenantIds: z.array(z.uuid()).max(1000).default([]),
  commTemplateId: optId,
  /** Replaces the template's message (or is the whole message without a template). */
  subject: optText(200),
  messageOverride: optText(2000),
  languageMode: z.enum(BROADCAST_LANGUAGE_MODES).default('TENANT_PREFERENCE'),
  channels: z.array(z.enum(BROADCAST_CHANNELS)).min(1, 'Pick at least one channel').max(4).transform((c) => [...new Set(c)]),
  /** Preview only: count the recipients, write nothing. */
  preview: z.boolean().default(false),
}).superRefine(issues(broadcastErrors));
export type BroadcastInput = z.infer<typeof BroadcastInputSchema>;

/** Preview and result of POST /api/admin/broadcasts. */
export type BroadcastResult = {
  broadcastId: string | null; companies: number; recipients: number;
  byChannel: { channel: string; recipients: number; skipped: number }[];
  delivered: number; queued: number; estimatedSmsCost: number;
};
