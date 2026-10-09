import type { BackupOverview, BackupSnapshot, DataImport, ImportError, IntegrationCard, IssuedApiKey, RestoreRequest, TenantWebhook, TenantWebhookDelivery } from '../../../../../shared/index.js';

/** Persistence for data imports, integrations / webhooks and tenant backups (schema Company; API keys read from Platform). */
export abstract class DataOpsStore {
  // imports
  abstract nextImportNo(): Promise<string>;
  abstract createImport(tenantId: string, data: Record<string, unknown>): Promise<string>;
  abstract updateImport(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract replaceImportErrors(tenantId: string, id: string, errors: ImportError[]): Promise<void>;
  abstract addImportErrors(tenantId: string, id: string, errors: ImportError[]): Promise<void>;
  abstract listImports(tenantId: string): Promise<DataImport[]>;
  abstract getImport(tenantId: string, id: string, withErrors: boolean): Promise<DataImport | null>;
  /** Units by code (upper case) → id, for item imports. */
  abstract unitIds(tenantId: string): Promise<Map<string, string>>;

  // integrations
  abstract integrationCards(tenantId: string): Promise<IntegrationCard[]>;
  abstract setIntegration(tenantId: string, provider: string, category: string, displayName: string, status: 'CONNECTED' | 'NOT_CONNECTED', userId: string): Promise<void>;
  abstract issuedKeys(tenantId: string): Promise<IssuedApiKey[]>;
  abstract listWebhooks(tenantId: string): Promise<TenantWebhook[]>;
  abstract getWebhook(tenantId: string, id: string): Promise<(TenantWebhook & { signingSecretEnc: Buffer }) | null>;
  abstract createWebhook(tenantId: string, data: { url: string; events: string[]; isActive: boolean; signingSecretEnc: Buffer }): Promise<string>;
  abstract updateWebhook(tenantId: string, id: string, rowVersion: number, data: { url: string; events: string[]; isActive: boolean }): Promise<boolean>;
  abstract deleteWebhook(tenantId: string, id: string): Promise<void>;
  abstract recordDelivery(tenantId: string, d: { endpointId: string; event: string; payload: unknown; attempt: number; responseStatus: number | null; isSuccess: boolean; error: string | null; durationMs: number }): Promise<string>;
  abstract deliveries(tenantId: string, endpointId: string): Promise<TenantWebhookDelivery[]>;
  abstract getDelivery(tenantId: string, id: string): Promise<(TenantWebhookDelivery & { payload: unknown }) | null>;

  // backups
  abstract backupOverview(tenantId: string): Promise<Omit<BackupOverview, 'companyCode'>>;
  abstract companyCode(tenantId: string): Promise<string>;
  abstract saveBackupSettings(tenantId: string, data: Record<string, unknown>): Promise<void>;
  abstract startBackup(tenantId: string, data: { snapshotCode: string; kind: string; note: string | null; requestedByUserId: string; expiresAt: Date | null }): Promise<string>;
  abstract finishBackup(tenantId: string, id: string, result: { status: 'COMPLETED' | 'FAILED'; sizeBytes: number | null; statusNote: string | null }): Promise<void>;
  abstract getBackup(tenantId: string, id: string): Promise<BackupSnapshot | null>;
  abstract openRestore(tenantId: string): Promise<{ id: string } | null>;
  abstract createRestore(tenantId: string, data: { snapshotId: string; reason: string; confirmText: string; takeSafetyBackup: boolean; safetySnapshotId: string | null; requestedByUserId: string }): Promise<string>;
  abstract getRestore(tenantId: string, id: string): Promise<RestoreRequest | null>;
  abstract cancelRestore(tenantId: string, id: string, rowVersion: number): Promise<boolean>;
}

/** Writes and reads tenant snapshot files (the platform tenant-export runner's JSON). */
export abstract class TenantSnapshots {
  abstract locationFor(tenantId: string, snapshotCode: string): string;
  abstract export(tenantId: string, location: string): Promise<{ sizeBytes: number }>;
  abstract read(location: string): Promise<Buffer>;
}

/** Sends one signed webhook request (HMAC-SHA256 over "<t>.<body>"). */
export abstract class WebhookSender {
  abstract send(url: string, secret: string, event: string, payload: unknown): Promise<{ status: number | null; ok: boolean; error: string | null; durationMs: number }>;
}
