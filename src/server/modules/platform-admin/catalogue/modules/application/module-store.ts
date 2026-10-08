import type { PlatformModule } from '../../../../../../shared/index.js';

/** Port: platform modules and their per-plan inclusion (Platform schema). */
export abstract class ModuleStore {
  abstract list(): Promise<PlatformModule[]>;
  abstract get(id: string): Promise<PlatformModule | null>;
  /** Every key in use, deleted modules included (the key stays unique). */
  abstract allKeys(): Promise<{ id: string; key: string; deleted: boolean }[]>;
  abstract planExists(id: string): Promise<boolean>;
  /** Platform.platformModuleAddUpdate (plans[] replace the module's rows). Returns the id. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Add-ons, flag prerequisites or entitlement logs use it? */
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(id: string, rowVersion: number): Promise<void>;
}
