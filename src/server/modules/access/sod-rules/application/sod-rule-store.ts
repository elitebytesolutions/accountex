import type { SodRule } from '../../../../../shared/index.js';

export abstract class SodRuleStore {
  abstract list(tenantId: string): Promise<SodRule[]>;
  abstract retiredCodes(tenantId: string): Promise<string[]>;
  abstract knownPermissions(): Promise<Set<string>>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract delete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
