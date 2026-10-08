import { z } from 'zod';

/**
 * Phase 42: the communication log (Platform.CommunicationLogs): one row per message sent or queued, append-only.
 * Retrying a queued, failed or bounced message writes a new row pointing at it (retryOfId).
 */
export const COMM_LOG_RETRYABLE: readonly string[] = ['QUEUED', 'FAILED', 'BOUNCED'];
export const COMM_LOG_LOOKUPS = ['CommunicationLogStatus', 'CommunicationLogChannel'];

export type CommLog = {
  id: string; createdAt: string; templateId: string | null; templateName: string | null; broadcastId: string | null;
  tenantId: string | null; tenantName: string | null; recipient: string; channel: string; language: string; subject: string | null;
  status: string; errorMessage: string | null; sentAt: string | null; deliveredAt: string | null; isTest: boolean; retryOfId: string | null;
  retried: boolean;
};
export type CommLogList = { items: CommLog[]; total: number; counts: { all: number; delivered: number; failed: number; queued: number } };

export const CommLogQuerySchema = z.object({
  /** all · delivered (delivered / opened / read) · failed (failed / bounced) · queued */
  filter: z.enum(['all', 'delivered', 'failed', 'queued']).default('all'),
  /** Hours back from now (template "Last 24 hours"); 0 = everything. */
  hours: z.coerce.number().int().min(0).max(24 * 365).default(24),
  tenantId: z.uuid().optional(),
  broadcastId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type CommLogQuery = z.infer<typeof CommLogQuerySchema>;
