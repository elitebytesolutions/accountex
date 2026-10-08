import type { MyOnboarding, OnboardingBoard, OnboardingDetail, OnboardingOptions } from '../../../../../shared/index.js';

export type TaskFacts = { id: string; onboardingId: string; ownerFunction: string; ownerEmployeeId: string | null; actionKind: string; status: string; rowVersion: number; employeeId: string };

export abstract class OnboardingStore {
  abstract today(tenantId: string): Promise<string>;
  abstract board(tenantId: string, q: { status: string; today: string }): Promise<Omit<OnboardingBoard, 'myId'>>;
  abstract get(tenantId: string, id: string, today: string): Promise<OnboardingDetail | null>;
  abstract options(tenantId: string): Promise<OnboardingOptions>;
  abstract task(tenantId: string, taskId: string): Promise<TaskFacts | null>;
  abstract myOnboarding(tenantId: string, employeeId: string, today: string): Promise<Omit<MyOnboarding, 'myId'>>;
  abstract employeeIdOfUser(tenantId: string, userId: string): Promise<string | null>;
  abstract start(data: Record<string, unknown>): Promise<string>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract cancel(id: string, reason: string | null): Promise<void>;
  abstract updateTask(id: string, data: Record<string, unknown>): Promise<void>;
}
