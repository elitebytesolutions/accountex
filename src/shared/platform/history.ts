import { z } from 'zod';
import { HistoryItemSchema } from '../common/history.ts';
import { listResultSchema } from '../common/list-query.ts';

/**
 * One version of a platform record or of one of its child rows (Platform.getPlatformRecordHistory, Phase 36).
 * `table` is the Platform table the row lives in; `recordId` is that row's id.
 */
export const AdminHistoryItemSchema = HistoryItemSchema.extend({
  table: z.string(),
  recordId: z.string().nullable(),
});
export type AdminHistoryItem = z.infer<typeof AdminHistoryItemSchema>;

export const AdminHistoryPageSchema = listResultSchema(AdminHistoryItemSchema);
export type AdminHistoryPage = z.infer<typeof AdminHistoryPageSchema>;
