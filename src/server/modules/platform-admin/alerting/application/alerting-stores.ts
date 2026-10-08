import type {
  AuditAlertRule,
  MaintenanceWindow,
  PlatformAuditLogQuery,
  PlatformAuditLogRow,
  UsageAlertRule,
  UsageAlertRuleOptions,
} from '../../../../../shared/index.js';

/** Port: Platform.MaintenanceWindows (writes through Platform.maintenanceWindowAddUpdate). */
export abstract class MaintenanceWindowStore {
  abstract list(upcomingOnly: boolean): Promise<MaintenanceWindow[]>;
  abstract get(id: string): Promise<MaintenanceWindow | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
}

/** Port: Platform.UsageAlertRules (writes through Platform.usageAlertRuleAddUpdate). */
export abstract class UsageAlertRuleStore {
  abstract list(): Promise<UsageAlertRule[]>;
  abstract get(id: string): Promise<UsageAlertRule | null>;
  abstract options(): Promise<UsageAlertRuleOptions>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract delete(id: string): Promise<void>;
}

/** Port: Platform.AuditAlertRules (writes through Platform.auditAlertRuleAddUpdate) and the read-only platform audit log. */
export abstract class AuditAlertRuleStore {
  abstract list(): Promise<AuditAlertRule[]>;
  abstract get(id: string): Promise<AuditAlertRule | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract delete(id: string): Promise<void>;
  abstract auditLog(q: PlatformAuditLogQuery): Promise<{ items: PlatformAuditLogRow[]; total: number }>;
}
