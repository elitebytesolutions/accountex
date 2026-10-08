export type AttachmentRow = {
  id: string; entityType: string | null; entityId: string | null; purpose: string; fileName: string; contentType: string; sizeBytes: number;
  storageKey: string; uploadedByUserId: string | null; createdAt: string;
};

/** Company.Attachments rows (no history trigger on the table: the owning record's history shows the link). */
export abstract class AttachmentStore {
  abstract create(row: { tenantId: string; entityType: string | null; entityId: string | null; purpose: string; fileName: string; contentType: string; sizeBytes: number; storageKey: string; sha256: Buffer; uploadedByUserId: string }): Promise<string>;
  abstract get(tenantId: string, id: string): Promise<AttachmentRow | null>;
  abstract many(tenantId: string, ids: string[]): Promise<AttachmentRow[]>;
  abstract softDelete(tenantId: string, id: string): Promise<void>;
}
