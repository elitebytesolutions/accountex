import type { LetterRequestItem, LetterRequestQuery, LetterTypeOption } from '../../../../../shared/self-service/letter-request.js';

/** Port: EmployeeSelfService.LetterRequests (RQ-) reads and writes. Writes run inside the caller's unit of work. */
export abstract class LetterRequestStore {
  abstract employeeOfUser(tenantId: string, userId: string): Promise<string | null>;
  abstract list(tenantId: string, q: LetterRequestQuery & { employeeId?: string }): Promise<{ items: LetterRequestItem[]; total: number; counts: Record<string, number> }>;
  abstract get(tenantId: string, id: string): Promise<LetterRequestItem | null>;
  abstract types(): Promise<LetterTypeOption[]>;
  /** Today (YYYY-MM-DD) in the company time zone: the request date and its RQ- number period. */
  abstract today(tenantId: string): Promise<string>;
  /** letterRequestAddUpdate: insert without `id`, else a partial update checked against `rowVersion`. */
  abstract save(data: Record<string, unknown>): Promise<string>;
}
