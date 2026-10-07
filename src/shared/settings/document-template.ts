import { z } from 'zod';
import { RowVersionSchema } from '../common/list-query.ts';

/** Template "Show on document" checkboxes. */
export const TEMPLATE_FLAGS = [
  { key: 'showNtnStrn', label: 'NTN & STRN' },
  { key: 'showFbrQr', label: 'FBR invoice no. & QR' },
  { key: 'showHsCodes', label: 'Item HS codes' },
  { key: 'showItemImages', label: 'Item images' },
  { key: 'showAmountInWords', label: 'Amount in words' },
  { key: 'showBankDetails', label: 'Bank details' },
] as const;

/** Merge fields offered in the editor (template "Merge fields" chips). */
export const MERGE_FIELDS = ['{{customer.name}}', '{{invoice.number}}', '{{invoice.date}}', '{{invoice.total}}', '{{gst.amount}}', '{{fbr.irn}}', '{{company.ntn}}', '{{employee.name}}', '{{employee.designation}}'];

export const DocumentTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  docType: z.string().nullable(),
  docTypeName: z.string().nullable(),
  letterKind: z.string().nullable(),
  paper: z.string(),
  headerLayout: z.string(),
  language: z.string(),
  showNtnStrn: z.boolean(),
  showFbrQr: z.boolean(),
  showHsCodes: z.boolean(),
  showItemImages: z.boolean(),
  showAmountInWords: z.boolean(),
  showBankDetails: z.boolean(),
  bodyHtml: z.string().nullable(),
  version: z.number().int(),
  isDefault: z.boolean(),
  status: z.string(),
  updatedAt: z.string(),
  rowVersion: z.number().int(),
});
export type DocumentTemplate = z.infer<typeof DocumentTemplateSchema>;

const TemplateFields = z.object({
  name: z.string().trim().min(2, 'Name the template').max(80),
  category: z.string().min(1, 'Choose a category'),
  docType: z.string().optional().nullable().transform((v) => (v ? v : null)),
  letterKind: z.string().optional().nullable().transform((v) => (v ? v : null)),
  paper: z.string().min(1),
  headerLayout: z.string().min(1),
  language: z.string().min(1),
  showNtnStrn: z.boolean(),
  showFbrQr: z.boolean(),
  showHsCodes: z.boolean(),
  showItemImages: z.boolean(),
  showAmountInWords: z.boolean(),
  showBankDetails: z.boolean(),
  bodyHtml: z.string().max(100_000).optional().nullable().transform((v) => (v ? v : null)),
});
const templateRules = <T extends z.ZodType<{ category: string; letterKind: string | null; docType: string | null }>>(s: T) =>
  s
    .refine((t) => (t.category === 'HR_LETTER') === !!t.letterKind, { path: ['letterKind'], message: 'HR letters need a letter kind (and only they do)' })
    .refine((t) => t.category === 'HR_LETTER' || !!t.docType, { path: ['docType'], message: 'Choose the document type it prints' });

export const DocumentTemplateSaveSchema = templateRules(TemplateFields);
export type DocumentTemplateSave = z.infer<typeof DocumentTemplateSaveSchema>;
export type DocumentTemplateSaveFields = z.input<typeof DocumentTemplateSaveSchema>;
export const DocumentTemplateUpdateSchema = templateRules(TemplateFields.extend(RowVersionSchema.shape));
export type DocumentTemplateUpdate = z.infer<typeof DocumentTemplateUpdateSchema>;
