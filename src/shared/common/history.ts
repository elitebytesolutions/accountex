import { z } from 'zod';
import { listResultSchema } from './list-query.ts';

/** One version of a record: who changed it, when, what changed and the full row at that version. */
export const HistoryItemSchema = z.object({
  entryId: z.string(),
  occurredAt: z.string(),
  action: z.string(),
  version: z.number().int(),
  actor: z.object({
    id: z.string().nullable(),
    name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  /** UPDATE: { field: { before, after } }. INSERT/DELETE: the whole row. Secrets appear as "[redacted]". */
  changes: z.record(z.string(), z.unknown()).nullable(),
  row: z.record(z.string(), z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  correlationId: z.string().nullable(),
});

export type HistoryItem = z.infer<typeof HistoryItemSchema>;

export const HistoryPageSchema = listResultSchema(HistoryItemSchema);
export type HistoryPage = z.infer<typeof HistoryPageSchema>;

export const HistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;
