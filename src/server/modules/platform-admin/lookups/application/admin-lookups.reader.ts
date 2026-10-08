import type { LookupsResponse } from '../../../../../shared/index.js';

/** Port: platform-wide fixed lists (active global Lookups.Lookups values, in sort order) for the Super Admin's selects. */
export abstract class AdminLookupsReader {
  abstract byTypes(types: string[]): Promise<LookupsResponse>;
}
