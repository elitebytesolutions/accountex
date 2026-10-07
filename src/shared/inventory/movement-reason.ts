import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { GlRefSchema, optionalText } from '../treasury/common.ts';

/** Why stock moves (Inventory.StockMovementReasons): picked on stock in / out and adjustments. */
export const MovementReasonSchema = z.object({
  id: z.string(),
  direction: z.string(),
  code: z.string(),
  label: z.string(),
  hint: z.string().nullable(),
  icon: z.string().nullable(),
  ledgerMovementType: z.string(),
  expenseAccount: GlRefSchema.nullable(),
  isSystem: z.boolean(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  rowVersion: z.number().int(),
});
export type MovementReason = z.infer<typeof MovementReasonSchema>;

export const REASON_DIRECTIONS = ['IN', 'OUT', 'ADJ'] as const;
export type ReasonDirection = (typeof REASON_DIRECTIONS)[number];
/** Ledger movement types allowed per direction (the lookup's parentCodes). */
export const LEDGER_TYPES_BY_DIRECTION: Record<ReasonDirection, string[]> = {
  IN: ['MANUAL_IN', 'OPENING'],
  OUT: ['MANUAL_OUT', 'WRITE_OFF'],
  ADJ: ['ADJUSTMENT', 'WRITE_OFF'],
};
/** Icons a reason can show (lucide names), as in the template's by-reason list. */
export const REASON_ICONS = ['package-plus', 'package-x', 'search-check', 'arrow-down-to-line', 'calendar-x', 'shield-alert', 'utensils', 'gift', 'clipboard-check', 'droplets', 'truck', 'recycle'] as const;

const ReasonFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Like WATER_DAMAGE (capital letters, digits, _)'),
  label: z.string().trim().min(2, 'Name the reason').max(60),
  hint: optionalText(120),
  icon: z.enum(REASON_ICONS).optional().nullable().transform((v) => v ?? null),
  ledgerMovementType: z.string().trim().min(1, 'Choose the ledger movement'),
  expenseAccountId: z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(100),
};

const ledgerFits = (r: { direction: ReasonDirection; ledgerMovementType: string }) => LEDGER_TYPES_BY_DIRECTION[r.direction].includes(r.ledgerMovementType);

export const MovementReasonCreateSchema = z
  .object({ direction: z.enum(REASON_DIRECTIONS), ...ReasonFields })
  .refine(ledgerFits, { path: ['ledgerMovementType'], message: 'Not allowed for this direction' });
export type MovementReasonCreate = z.infer<typeof MovementReasonCreateSchema>;
/** The direction is fixed once created (codes are unique per direction). */
export const MovementReasonUpdateSchema = patchFields(ReasonFields).extend(RowVersionSchema.shape);
export type MovementReasonUpdate = z.infer<typeof MovementReasonUpdateSchema>;
