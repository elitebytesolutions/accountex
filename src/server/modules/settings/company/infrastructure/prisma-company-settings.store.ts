import { Injectable } from '@nestjs/common';
import type { CompanySettings } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { CompanySettingsStore } from '../application/company-settings-store.js';

/** Same values as the column defaults of Company.CompanySettings. */
const DEFAULTS: CompanySettings = {
  id: null, rowVersion: 0, saved: false,
  legalName: '', tradingName: null, secpRegNo: null, ntn: '', strn: null, registeredAddress: null, city: null, province: null,
  phone: null, email: null, website: null, industry: null, timezone: 'Asia/Karachi', legalStructure: null,
  fyStartMonth: 7, baseCurrencyCode: 'PKR', amountDecimals: 2, numberFormat: 'WESTERN', booksLockDate: null, fxRateSource: 'SBP_DAILY',
  allowMultiCurrency: false, requireCostCentreOnExpense: false, allowFuturePeriodPosting: false,
  defaultCustomerTermsDays: 30, quotationValidityDays: 15, invoiceTerms: null, creditLimitAction: 'BLOCK_OVERRIDE', overdueToleranceDays: 15,
  blockOverdueOver90: true, defaultVendorTermsDays: 45, threeWayMatchTolerancePct: 2, billApprovalThreshold: null, requireApprovedPoForBill: true,
  autoDeductWht153: true, allowPartialGrn: false, warnDuplicateVendorInvoice: true,
  payDayRule: 'LAST_WORKING_DAY', payrollCutoff: 'DAY_25', workingDaysBasis: 'CALENDAR_DAYS', eobiEmployerAmount: null, pfRatePct: null,
  autoDeductSalaryTax: true, publishPayslipsToEss: true, workingWeek: 'MON_SAT_HALF_SAT', graceMinutes: 15, lateMarksPerLeave: 3,
  halfDayBelowHours: 5, overtimeMultiplier: 2, attendanceSource: 'BIOMETRIC_AND_ESS', geofenceEssPunch: true, allowOffsitePersonalPunch: false,
  gstRegistered: true, salesTaxReturnPeriod: 'MONTHLY', standardGstRatePct: 18, furtherTaxRatePct: 4, provincialTaxAuthority: null,
  provincialServicesRatePct: null, fbrRealtimeReporting: false, printFbrQr: false,
  brandPrimaryColour: '#15803D', brandAccentColour: '#EFBC61', documentFont: 'INTER', paperSize: 'A4', emailFooter: null, showPoweredBy: true,
};
const KEYS = Object.keys(DEFAULTS).filter((k) => k !== 'saved');

/** Prisma Decimal → number, Date → YYYY-MM-DD, char(n) → trimmed. */
const plain = (v: unknown): unknown => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v && typeof v === 'object' && 'toNumber' in v) return (v as { toNumber(): number }).toNumber();
  if (typeof v === 'string') return v.trimEnd();
  return v;
};

@Injectable()
export class PrismaCompanySettingsStore extends CompanySettingsStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async get(tenantId: string): Promise<CompanySettings | null> {
    const row = await this.prisma.db().companySettings.findFirst({ where: { tenantId } });
    if (!row) return null;
    const out: Record<string, unknown> = { saved: true };
    for (const k of KEYS) out[k] = plain((row as Record<string, unknown>)[k]);
    return out as CompanySettings;
  }

  defaults(): CompanySettings {
    return { ...DEFAULTS };
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'companySettingAddUpdate', data);
  }
}
