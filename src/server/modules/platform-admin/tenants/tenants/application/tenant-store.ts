import type { SeedReport, TenantDetail, TenantKpis, TenantListItem, TenantListQuery } from '../../../../../../shared/index.js';

export type TenantWrite = Partial<{
  displayName: string; legalName: string; ntn: string | null; strn: string | null; secpRegNo: string | null; industry: string | null;
  city: string | null; province: string | null; address: string | null; phone: string | null; email: string | null;
  fiscalYearStartMonth: number; timezone: string; numberFormat: string; dateFormat: string; dataResidency: string; defaultLanguage: string;
  coaTemplateId: string | null; status: string; trialEndsOn: string | null; activatedAt: Date | null; suspendedAt: Date | null;
  suspensionReason: string | null; churnedAt: Date | null; churnReason: string | null; isBeta: boolean; isInternal: boolean; requireMfa: boolean;
}>;

/** Port: Platform.Tenants and its child tables, plus the provisioning / seeding database functions. */
export abstract class TenantStore {
  abstract list(q: TenantListQuery): Promise<{ items: TenantListItem[]; total: number; kpis: TenantKpis; regions: { province: string | null; count: number }[] }>;
  abstract detail(id: string): Promise<TenantDetail | null>;
  abstract codeTaken(code: string): Promise<boolean>;
  abstract coaTemplateUsable(id: string): Promise<boolean>;
  /** The DEFAULT chart-of-accounts template (id, name), if any. */
  abstract defaultCoaTemplate(): Promise<{ id: string; name: string } | null>;
  /** Accounting.applyChartTemplate run as the new company: its accounts and default posting-role mappings. Returns the account count. */
  abstract applyChartTemplate(tenantId: string, templateId: string): Promise<number>;
  abstract planModules(planId: string): Promise<{ moduleKey: string; inclusion: string }[]>;
  /** Platform.provisionTenant: tenant → system roles (default grants) → default user with every role. Returns the id. */
  abstract provision(p: { code: string; name: string; legalName: string; email: string; adminName: string; passwordHash: string }): Promise<string>;
  /** Replaces the fiscal year provisioning created (July) when the company starts its year in another month. */
  abstract resetFiscalYear(tenantId: string, startMonth: number): Promise<void>;
  /** Updates when rowVersion matches (null = no check); false when stale. */
  abstract update(id: string, rowVersion: number | null, data: TenantWrite): Promise<boolean>;
  abstract addContact(tenantId: string, c: { contactRole: string; fullName: string; designation: string | null; email: string; mobile: string | null; cnic?: string | null; language: string; isPrimary: boolean }): Promise<void>;
  abstract setModules(tenantId: string, modules: { moduleKey: string; enabled: boolean; source: string }[]): Promise<void>;
  abstract addNote(tenantId: string, staffId: string, body: string): Promise<void>;
  abstract applySeeds(tenantId: string, leave: boolean, salary: boolean, tax: boolean): Promise<SeedReport>;
  /** Ends every open session of the company's users; returns how many. */
  abstract revokeSessions(tenantId: string, reason: string): Promise<number>;
}
