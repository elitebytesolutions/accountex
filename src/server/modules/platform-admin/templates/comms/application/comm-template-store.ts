import type { CommTemplate } from '../../../../../../shared/index.js';

/** Port: communication templates (Platform.CommunicationTemplates). Writes run inside a UnitOfWork. */
export abstract class CommTemplateStore {
  abstract list(): Promise<CommTemplate[]>;
  abstract allCodes(): Promise<{ id: string; code: string }[]>;
  /** Platform.communicationTemplateAddUpdate. Returns the id. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Messages (CommunicationLogs) or broadcasts (TenantBroadcasts) used it? */
  abstract inUse(id: string): Promise<boolean>;
  abstract remove(id: string, rowVersion: number): Promise<void>;
}
