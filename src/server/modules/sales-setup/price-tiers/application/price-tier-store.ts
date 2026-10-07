import type { PriceTier } from '../../../../../shared/index.js';

export abstract class PriceTierStore {
  abstract list(tenantId: string): Promise<PriceTier[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
}
