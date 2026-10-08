import { z } from 'zod';
import { patchFields } from '../common/list-query.ts';
import { optInt, optText, rowVersion } from './fields.ts';

/**
 * Phase 38: resellers (Platform.Resellers), the partner network. The IBAN is write-only: it is sealed with SecretBox
 * (ibanEnc) and only a mask (ibanMasked) is ever returned. Tenants, MRR and payouts come from billing (Phase 41).
 */
export const RESELLER_TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;
export const RESELLER_STATUSES = ['ACTIVE', 'SUSPENDED', 'TERMINATED'] as const;
export const PAYOUT_METHODS = ['IBFT', 'CHEQUE'] as const;

export type Reseller = {
  id: string;
  name: string;
  city: string | null;
  tier: string;
  commissionPct: number;
  nextTierTenants: number | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  ntn: string | null;
  isActiveTaxpayer: boolean;
  payoutMethod: string;
  bankName: string | null;
  /** e.g. "PK36 MEZN •••• 4471"; the IBAN itself never leaves the server. */
  ibanMasked: string | null;
  inviteCode: string | null;
  status: string;
  /** Tenants attributed to the partner (ResellerTenants, written by billing). */
  tenantsCount: number;
  updatedAt: string;
  rowVersion: number;
};

/** Pakistani IBAN: PK + 2 check digits + 4-letter bank code + 16 digits (spaces allowed when typed). */
export const PK_IBAN = /^PK\d{2}[A-Z]{4}\d{16}$/;
const iban = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/\s+/g, '').toUpperCase() || undefined : v ?? undefined),
  z.string().regex(PK_IBAN, 'PK + 22 characters, e.g. PK36MEZN0001234567894471').optional(),
);

const ResellerFields = {
  name: z.string().trim().min(2, 'Name the partner').max(120),
  city: optText(60),
  tier: z.enum(RESELLER_TIERS).default('BRONZE'),
  commissionPct: z.coerce.number('Enter a percentage').min(0, '0 to 100').max(100, '0 to 100'),
  nextTierTenants: optInt(1, 100_000, 'More than 0'),
  contactName: optText(120),
  email: z.preprocess((v) => (v === '' ? null : v), z.email('Enter a valid email').max(160).nullable().optional()),
  phone: optText(30),
  ntn: z.preprocess((v) => (v === '' ? null : v), z.string().trim().regex(/^\d{7}-?\d$/, 'NTN like 1234567-8').nullable().optional()),
  isActiveTaxpayer: z.boolean().default(false),
  payoutMethod: z.enum(PAYOUT_METHODS).default('IBFT'),
  bankName: optText(80),
  /** Write-only. Blank keeps the stored IBAN. */
  iban,
};
export const ResellerCreateSchema = z.object(ResellerFields);
export type ResellerCreate = z.infer<typeof ResellerCreateSchema>;
export const ResellerUpdateSchema = patchFields(ResellerFields).extend({ rowVersion });
export type ResellerUpdate = z.infer<typeof ResellerUpdateSchema>;
export const ResellerStatusInputSchema = z.object({ status: z.enum(RESELLER_STATUSES), rowVersion });
export type ResellerStatusInput = z.infer<typeof ResellerStatusInputSchema>;
export const ResellerRowVersionSchema = z.object({ rowVersion });
