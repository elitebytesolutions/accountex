import { z } from 'zod';
import { optionalId } from '../parties/common.ts';
import { optionalText } from '../treasury/common.ts';

/**
 * Phase 33: assets issued to employees (laptops, phones, SIMs, cards, vehicles…), optionally linked to a fixed asset
 * (one holder at a time). An asset still issued when the employee exits becomes a clearance item; returning it clears it.
 */
export const EMPLOYEE_ASSET_CATEGORIES = ['LAPTOP', 'MOBILE', 'SIM', 'ACCESS_CARD', 'FUEL_CARD', 'VEHICLE', 'TOOL', 'OTHER'] as const;
export const EMPLOYEE_ASSET_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'WORN', 'DAMAGED', 'LOST'] as const;

export type EmployeeAssetItem = {
  id: string; category: string; assetName: string; specification: string | null; tag: string | null; serialNo: string | null;
  fixedAsset: { id: string; code: string } | null; issuedOn: string; returnedOn: string | null; condition: string | null; valueAmount: number | null;
  status: string; remarks: string | null; clearance: { offboardingId: string; status: string } | null; rowVersion: number;
};
export type EmployeeAssetOptions = { fixedAssets: { id: string; code: string; name: string; serialNo: string | null; cost: number; issuedTo: string | null }[] };

export const EmployeeAssetIssueSchema = z.object({
  category: z.enum(EMPLOYEE_ASSET_CATEGORIES, 'Choose the category'),
  assetId: optionalId,
  assetName: z.string().trim().max(120).optional().nullable().transform((v) => (v ? v : null)),
  specification: optionalText(200),
  tag: optionalText(40),
  serialNo: optionalText(60),
  issuedOn: z.iso.date('Use a date'),
  condition: z.enum(EMPLOYEE_ASSET_CONDITIONS).default('GOOD'),
  valueAmount: z.coerce.number('Not negative').min(0, 'Not negative').max(1_000_000_000).optional().nullable(),
  remarks: optionalText(300),
}).refine((a) => !!a.assetId || !!a.assetName, { path: ['assetName'], message: 'Name the asset or pick a fixed asset' });
export type EmployeeAssetIssue = z.infer<typeof EmployeeAssetIssueSchema>;
export const EmployeeAssetReturnSchema = z.object({
  returnedOn: z.iso.date('Use a date'),
  condition: z.enum(EMPLOYEE_ASSET_CONDITIONS, 'Choose the condition'),
  remarks: optionalText(300),
  rowVersion: z.coerce.number().int().min(0),
});
export type EmployeeAssetReturn = z.infer<typeof EmployeeAssetReturnSchema>;
