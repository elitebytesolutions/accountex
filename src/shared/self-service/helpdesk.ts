import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

/** Icons a helpdesk desk may use (lucide names; the employee view maps each to its template tile colour). */
export const HELPDESK_ICONS = ['users', 'banknote', 'laptop', 'building-2', 'life-buoy', 'shield-check', 'heart-pulse', 'file-text', 'wrench', 'truck'] as const;
export type HelpdeskIcon = (typeof HELPDESK_ICONS)[number];

const keywords = z
  .array(z.string().trim().toLowerCase().min(2, 'At least 2 letters').max(30))
  .max(20, 'Up to 20 keywords')
  .default([])
  .transform((xs) => [...new Set(xs)]);

// ---------------------------------------------------------------- categories
/** A helpdesk desk (EmployeeSelfService.HelpdeskCategories): where tickets are routed and the reply SLA. */
export const HelpdeskCategorySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** The owning employee; selectable once employees (Phase 11) are accepted. */
  ownerEmployeeId: z.string().nullable(),
  slaHours: z.number(),
  highPrioritySlaFactor: z.number(),
  routingKeywords: z.array(z.string()),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  status: z.string(),
  faqCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type HelpdeskCategory = z.infer<typeof HelpdeskCategorySchema>;
const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const HelpdeskCategoryFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,19}$/, 'Like PAYROLL (2–20 capitals, digits or _)'),
  name: z.string().trim().min(2, 'Name the desk').max(60),
  description: optionalText(200),
  /** The desk's owning employee (Phase 11). */
  ownerEmployeeId: optionalId,
  slaHours: z.coerce.number().gt(0, 'More than 0 hours').max(9999, 'Up to 9,999 hours'),
  highPrioritySlaFactor: z.coerce.number().gt(0, 'More than 0').max(1, 'At most 1 (same as normal)').default(0.5),
  routingKeywords: keywords,
  icon: z.enum(HELPDESK_ICONS).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  sortOrder: z.coerce.number().int('Whole number').min(0).max(999).default(0),
};
export const HelpdeskCategoryCreateSchema = z.object(HelpdeskCategoryFields);
export type HelpdeskCategoryCreate = z.infer<typeof HelpdeskCategoryCreateSchema>;
export const HelpdeskCategoryUpdateSchema = patchFields(HelpdeskCategoryFields).extend(RowVersionSchema.shape);
export type HelpdeskCategoryUpdate = z.infer<typeof HelpdeskCategoryUpdateSchema>;

// ---------------------------------------------------------------- FAQs
/** A "Quick answers" entry (EmployeeSelfService.HelpdeskFaqs) under a desk. */
export const HelpdeskFaqSchema = z.object({
  id: z.string(),
  category: z.object({ id: z.string(), code: z.string(), name: z.string() }),
  question: z.string(),
  answer: z.string(),
  keywords: z.array(z.string()),
  sortOrder: z.number().int(),
  isPublished: z.boolean(),
  rowVersion: z.number().int(),
});
export type HelpdeskFaq = z.infer<typeof HelpdeskFaqSchema>;
const HelpdeskFaqFields = {
  categoryId: z.uuid('Choose the desk'),
  question: z.string().trim().min(5, 'Write the question').max(200),
  answer: z.string().trim().min(2, 'Write the answer').max(2000),
  keywords,
  sortOrder: z.coerce.number().int('Whole number').min(0).max(999).default(0),
  isPublished: z.boolean().default(true),
};
export const HelpdeskFaqCreateSchema = z.object(HelpdeskFaqFields);
export type HelpdeskFaqCreate = z.infer<typeof HelpdeskFaqCreateSchema>;
export const HelpdeskFaqUpdateSchema = patchFields(HelpdeskFaqFields).extend(RowVersionSchema.shape);
export type HelpdeskFaqUpdate = z.infer<typeof HelpdeskFaqUpdateSchema>;

// ---------------------------------------------------------------- employee view
/** GET /api/me/helpdesk: the active desks and their published answers (template app/profile/helpdesk). */
export const MyHelpdeskSchema = z.object({
  categories: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), description: z.string().nullable(), icon: z.string().nullable(), slaHours: z.number() })),
  faqs: z.array(z.object({ id: z.string(), question: z.string(), answer: z.string(), keywords: z.array(z.string()), category: z.object({ code: z.string(), name: z.string() }) })),
});
export type MyHelpdesk = z.infer<typeof MyHelpdeskSchema>;
