import type { OffboardingBoard, OffboardingDetail, OffboardingOptions } from '../../../../../shared/index.js';

export type OffboardingEmployee = { id: string; status: string; noticeDays: number; reportingManagerId: string | null };

export abstract class OffboardingStore {
  abstract today(tenantId: string): Promise<string>;
  abstract board(tenantId: string, q: { status: string; today: string }): Promise<OffboardingBoard>;
  abstract get(tenantId: string, id: string): Promise<OffboardingDetail | null>;
  abstract options(tenantId: string): Promise<OffboardingOptions>;
  abstract employee(tenantId: string, id: string): Promise<OffboardingEmployee | null>;
  abstract hasOpen(tenantId: string, employeeId: string): Promise<boolean>;
  abstract clearanceOf(tenantId: string, itemId: string): Promise<{ offboardingId: string } | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract clear(itemId: string, status: 'CLEARED' | 'WAIVED', remarks: string | null): Promise<void>;
  abstract complete(id: string): Promise<{ suspendedUserIds: string[] }>;
  abstract withdraw(id: string, reason: string | null): Promise<void>;
}
