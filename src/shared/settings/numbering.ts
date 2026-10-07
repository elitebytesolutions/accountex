import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

/** A numbering series with its live preview (Company.getNumberingSeriesPreview). */
export const NumberingSeriesSchema = z.object({
  id: z.string(),
  docType: z.string(),
  docTypeName: z.string(),
  docTypeModule: z.string(),
  branchId: z.string().nullable(),
  branchCode: z.string().nullable(),
  prefix: z.string(),
  pattern: z.string(),
  padding: z.number().int(),
  startValue: z.number().int(),
  resetPolicy: z.string(),
  isActive: z.boolean(),
  nextValue: z.number().int(),
  preview: z.string(),
  /** Has issued numbers: format is locked and the series cannot be deleted. */
  inUse: z.boolean(),
  rowVersion: z.number().int(),
});
export type NumberingSeries = z.infer<typeof NumberingSeriesSchema>;

export const DocumentTypeSchema = z.object({
  code: z.string(),
  name: z.string(),
  module: z.string(),
  defaultPrefix: z.string(),
  defaultPattern: z.string(),
  defaultPadding: z.number().int(),
  defaultResetPolicy: z.string(),
});
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

/** Same rules as the database checks on Company.NumberingSeries. */
const SeriesFields = {
  docType: z.string().min(1, 'Choose a document type'),
  branchId: z.uuid().optional().nullable().transform((v) => v ?? null),
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9-]{0,9}$/, 'Letters, digits and dashes, starting with a letter (max 10)'),
  pattern: z
    .string()
    .trim()
    .max(60, 'At most 60 characters')
    .refine((p) => p.includes('{SEQ'), 'Must contain {SEQ} or {SEQn}'),
  padding: z.coerce.number().int().min(1, '1–12').max(12, '1–12'),
  startValue: z.coerce.number().int().min(1, 'At least 1'),
  resetPolicy: z.string().min(1),
  isActive: z.boolean().default(true),
};

export const NumberingSeriesCreateSchema = z.object(SeriesFields);
export type NumberingSeriesCreate = z.infer<typeof NumberingSeriesCreateSchema>;
export type NumberingSeriesCreateFields = z.input<typeof NumberingSeriesCreateSchema>;

export const NumberingSeriesUpdateSchema = patchFields(SeriesFields).extend(RowVersionSchema.shape);
export type NumberingSeriesUpdate = z.infer<typeof NumberingSeriesUpdateSchema>;
