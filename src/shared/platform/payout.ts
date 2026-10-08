import { z } from 'zod';
import { optDate, optNum, optText, rowVersion } from './fields.ts';

/**
 * Phase 41: reseller payouts (Platform.ResellerPayouts) and reseller–tenant attribution (ResellerTenants). A payout is
 * the month's commission of a partner: Σ MRR × commission % of its attributed companies, less WHT 12% u/s 233, with
 * the per-company statement lines. DUE → PAID (paid on, reference) or CANCELLED.
 */
export const PAYOUT_WHT_RATE = 12;

export type PayoutLine = {
  tenantId: string; tenantCode: string; tenantName: string; planCode: string | null; planName: string | null;
  mrr: number; commissionPct: number; commission: number;
};
export type ResellerPayout = {
  id: string; partnerId: string; partnerName: string; partnerTier: string; partnerCity: string | null; payoutMethod: string; bankName: string | null;
  ibanMasked: string | null; ntn: string | null; isActiveTaxpayer: boolean; periodMonth: string; tenantsCount: number; sourcedMrr: number;
  commissionPct: number; grossAmount: number; whtSection: string; whtRate: number; whtAmount: number; netAmount: number;
  statementLines: PayoutLine[]; status: string; paidOn: string | null; paymentRef: string | null; whtCertificateNo: string | null;
  createdAt: string; rowVersion: number;
};
/** Platform.getResellerCommissions: the partner's live attribution and what is due. */
export type ResellerCommission = {
  partnerId: string; name: string; tenants: number; sourcedMrr: number; expectedCommission: number;
  dueGross: number; dueWht: number; dueNet: number; oldestDueMonth: string | null; lastPaidOn: string | null;
};
export type PayoutList = { items: ResellerPayout[]; commissions: ResellerCommission[]; kpis: { partnerMrr: number; commissionDue: number; dueCount: number } };

export type ResellerAttribution = {
  id: string; partnerId: string; tenantId: string; tenantCode: string; tenantName: string; tenantStatus: string; attributedOn: string;
  endedOn: string | null; commissionPctOverride: number | null; mrr: number; rowVersion: number;
};

export const PayoutListQuerySchema = z.object({ partnerId: z.uuid().optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional() });
export const PayoutCalculateQuerySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM').optional() });
export type PayoutCalculateResult = { month: string; created: number; payouts: ResellerPayout[] };

export const PayoutPaySchema = z.object({
  rowVersion,
  paidOn: z.iso.date('Choose the payment date'),
  paymentRef: z.string().trim().min(2, 'Enter the IBFT / cheque reference').max(80),
  whtCertificateNo: optText(40),
});
export type PayoutPay = z.infer<typeof PayoutPaySchema>;
export const PayoutCancelSchema = z.object({ rowVersion });

export const ResellerAttributionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('attribute'),
    tenantId: z.uuid('Choose a company'),
    attributedOn: optDate.optional(),
    commissionPctOverride: optNum(0, 100, '0 to 100').optional(),
  }),
  z.object({ action: z.literal('end'), tenantId: z.uuid('Choose a company'), endedOn: optDate.optional() }),
]);
export type ResellerAttributionInput = z.infer<typeof ResellerAttributionSchema>;
