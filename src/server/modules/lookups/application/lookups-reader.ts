import type { LookupsResponse } from '../../../../shared/index.js';

/** Port: reads fixed lists (active global values plus the tenant's own, in sort order). */
export abstract class LookupsReader {
  abstract byTypes(types: string[], tenantId: string): Promise<LookupsResponse>;
}
