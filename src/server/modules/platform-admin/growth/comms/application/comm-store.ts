import type { BroadcastInput, CommLog, CommLogList, CommLogQuery } from '../../../../../../shared/index.js';

/** A company a broadcast reaches, with what its messages need (owner contact, language, plan for {{variables}}). */
export type BroadcastCompany = {
  tenantId: string; code: string; name: string; language: string; planName: string | null;
  ownerName: string | null; ownerEmail: string | null; ownerMobile: string | null;
};
export type CommTemplateRow = { id: string; name: string; isActive: boolean; subjectEn: string; bodyEn: string; subjectUr: string | null; bodyUr: string | null };
export type NewCommLog = {
  commTemplateId: string | null; commBroadcastId: string | null; tenantId: string | null; recipient: string; channel: string; language: string;
  subject: string | null; body: string | null; status: string; errorMessage?: string | null; sentAt?: Date | null; deliveredAt?: Date | null;
  retryOfId?: string | null; relatedDocType?: string | null; relatedDocId?: string | null;
};

/** Port: Platform.TenantBroadcasts and Platform.CommunicationLogs, audience resolution and in-app delivery. */
export abstract class CommStore {
  /** Companies of a broadcast audience (segments through Platform.evaluateTenantSegment); churned companies never. */
  abstract resolveAudience(input: Pick<BroadcastInput, 'audience' | 'audienceValue' | 'segmentId' | 'tenantIds'>): Promise<BroadcastCompany[]>;
  abstract template(id: string): Promise<CommTemplateRow | null>;
  /** Platform.tenantBroadcastAddUpdate. */
  abstract saveBroadcast(data: Record<string, unknown>): Promise<string>;
  abstract insertLogs(rows: NewCommLog[]): Promise<string[]>;
  /** Platform.deliverInAppNotice: workspace notifications for the company's active admins; returns how many. */
  abstract deliverInApp(tenantId: string, title: string, body: string, severity: string): Promise<number>;
  abstract listLogs(q: CommLogQuery): Promise<CommLogList>;
  abstract getLog(id: string): Promise<(CommLog & { body: string | null; commTemplateId: string | null; relatedDocType: string | null; relatedDocId: string | null }) | null>;
}
