import { z } from 'zod';

/**
 * Company settings (one row per tenant, Company.CompanySettings), edited per settings tab.
 * Field rules mirror the database check constraints so users see field errors instead of 422s.
 */
const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const pct = z.coerce.number().min(0, '0–100').max(100, '0–100');
const days = z.coerce.number().int().min(0, '0–365').max(365, '0–365');

export const ProfileSectionSchema = z.object({
  legalName: z.string().trim().min(2, 'Legal name is required').max(160),
  tradingName: text(160),
  secpRegNo: text(30),
  ntn: z.string().trim().regex(/^\d{7}-\d$/, 'NTN format: 1234567-8'),
  strn: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.string().regex(/^\d{2}-\d{2}-\d{4}-\d{3}-\d{2}$/, 'STRN format: 12-34-5678-901-23').nullable()),
  registeredAddress: text(300),
  city: text(60),
  province: text(20),
  phone: text(40),
  email: z.string().trim().toLowerCase().optional().nullable().transform((v) => (v ? v : null)).pipe(z.email('Enter a valid email').nullable()),
  website: text(120),
  industry: text(40),
  timezone: z.string().trim().min(1).max(60).default('Asia/Karachi'),
  legalStructure: text(40),
});

export const FinanceSectionSchema = z.object({
  fyStartMonth: z.coerce.number().int().refine((m) => [1, 4, 7].includes(m), 'January, April or July'),
  baseCurrencyCode: z.string().regex(/^[A-Z]{3}$/),
  amountDecimals: z.coerce.number().int().refine((d) => [0, 2, 3].includes(d), '0, 2 or 3'),
  numberFormat: z.string().min(1),
  booksLockDate: z.iso.date('Use YYYY-MM-DD').optional().nullable().transform((v) => v ?? null),
  fxRateSource: z.string().min(1),
  allowMultiCurrency: z.boolean(),
  requireCostCentreOnExpense: z.boolean(),
  allowFuturePeriodPosting: z.boolean(),
});

export const SalesSectionSchema = z.object({
  defaultCustomerTermsDays: days,
  quotationValidityDays: z.coerce.number().int().min(1, '1–365').max(365, '1–365'),
  invoiceTerms: text(2000),
  creditLimitAction: z.string().min(1),
  overdueToleranceDays: z.coerce.number().int().min(0).max(365),
  blockOverdueOver90: z.boolean(),
  defaultVendorTermsDays: days,
  threeWayMatchTolerancePct: pct,
  billApprovalThreshold: z.coerce.number().min(0).optional().nullable().transform((v) => v ?? null),
  requireApprovedPoForBill: z.boolean(),
  autoDeductWht153: z.boolean(),
  allowPartialGrn: z.boolean(),
  warnDuplicateVendorInvoice: z.boolean(),
});

export const HrSectionSchema = z.object({
  payDayRule: z.string().min(1),
  payrollCutoff: z.string().min(1),
  workingDaysBasis: z.string().min(1),
  eobiEmployerAmount: z.coerce.number().min(0).optional().nullable().transform((v) => v ?? null),
  pfRatePct: pct.optional().nullable().transform((v) => v ?? null),
  autoDeductSalaryTax: z.boolean(),
  publishPayslipsToEss: z.boolean(),
  workingWeek: z.string().min(1),
  graceMinutes: z.coerce.number().int().min(0, '0–120').max(120, '0–120'),
  lateMarksPerLeave: z.coerce.number().int().min(1, '1–31').max(31, '1–31'),
  halfDayBelowHours: z.coerce.number().min(0).max(24),
  overtimeMultiplier: z.coerce.number().refine((m) => m === 1.5 || m === 2, '1.5× or 2×'),
  attendanceSource: z.string().min(1),
  geofenceEssPunch: z.boolean(),
  allowOffsitePersonalPunch: z.boolean(),
});

export const TaxSectionSchema = z.object({
  gstRegistered: z.boolean(),
  salesTaxReturnPeriod: z.string().min(1),
  standardGstRatePct: pct,
  furtherTaxRatePct: pct,
  provincialTaxAuthority: text(20),
  provincialServicesRatePct: pct.optional().nullable().transform((v) => v ?? null),
  fbrRealtimeReporting: z.boolean(),
  printFbrQr: z.boolean(),
});

const colour = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Hex colour like #15803D');
export const BrandingSectionSchema = z.object({
  brandPrimaryColour: colour,
  brandAccentColour: colour,
  documentFont: z.string().min(1),
  paperSize: z.string().min(1),
  emailFooter: text(500),
  showPoweredBy: z.boolean(),
});

export const SETTINGS_SECTIONS = {
  profile: ProfileSectionSchema,
  finance: FinanceSectionSchema,
  sales: SalesSectionSchema,
  hr: HrSectionSchema,
  tax: TaxSectionSchema,
  branding: BrandingSectionSchema,
} as const;
export type SettingsSection = keyof typeof SETTINGS_SECTIONS;

/** PUT /api/settings/company/:section body: the section's fields plus the rowVersion that was read (omitted on first profile save). */
export const settingsSectionBody = <S extends SettingsSection>(section: S) =>
  SETTINGS_SECTIONS[section].extend({ rowVersion: z.number().int().min(0).optional() });

/** GET /api/settings/company: the saved row, or null with the database defaults when the profile was never saved. */
export const CompanySettingsSchema = ProfileSectionSchema.extend(FinanceSectionSchema.shape)
  .extend(SalesSectionSchema.shape)
  .extend(HrSectionSchema.shape)
  .extend(TaxSectionSchema.shape)
  .extend(BrandingSectionSchema.shape)
  .extend({ id: z.string().nullable(), rowVersion: z.number().int(), saved: z.boolean() });
export type CompanySettings = z.infer<typeof CompanySettingsSchema>;
