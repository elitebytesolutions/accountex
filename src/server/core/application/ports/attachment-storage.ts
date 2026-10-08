/**
 * Port: where uploaded file bytes live (Phase 32: a local folder, UPLOAD_DIR). The database keeps one
 * Company.Attachments row per file with its storage key; the bytes are written here before the row commits.
 */
export abstract class AttachmentStorage {
  abstract put(key: string, data: Buffer): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
}
