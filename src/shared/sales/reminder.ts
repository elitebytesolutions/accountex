import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

/** Placeholders a reminder message may use; filled from the customer, the invoice and the company when it is sent. */
export const REMINDER_PLACEHOLDERS = ['customer', 'invoice', 'amount', 'due_date', 'company'] as const;

/** A reminder message (Sales.PaymentReminderTemplates), English with an optional Urdu version. */
export const ReminderTemplateSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  emailSubject: z.string().nullable(),
  bodyEn: z.string(),
  bodyUr: z.string().nullable(),
  isActive: z.boolean(),
  ruleCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type ReminderTemplate = z.infer<typeof ReminderTemplateSchema>;

const unknownPlaceholder = (t: string | null | undefined) => (t ?? '').match(/\{(\w+)\}/g)?.map((m) => m.slice(1, -1)).find((k) => !(REMINDER_PLACEHOLDERS as readonly string[]).includes(k));
const body = (max: number) => z.string().trim().max(max).superRefine((t, ctx) => {
  const bad = unknownPlaceholder(t);
  if (bad) ctx.addIssue({ code: 'custom', message: `Unknown placeholder {${bad}}` });
});
const TemplateFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,29}$/, 'Like FIRM_FOLLOW_UP'),
  name: z.string().trim().min(2, 'Name the message').max(80),
  emailSubject: optionalText(150),
  bodyEn: body(1000).pipe(z.string().min(10, 'Write the message')),
  bodyUr: body(1000).optional().nullable().transform((v) => (v ? v : null)),
  isActive: z.boolean().default(true),
};
export const ReminderTemplateCreateSchema = z.object(TemplateFields);
export type ReminderTemplateCreate = z.infer<typeof ReminderTemplateCreateSchema>;
export const ReminderTemplateUpdateSchema = patchFields(TemplateFields).extend(RowVersionSchema.shape);
export type ReminderTemplateUpdate = z.infer<typeof ReminderTemplateUpdateSchema>;

export const REMINDER_CHANNELS = ['WHATSAPP', 'SMS', 'EMAIL'] as const;
export const ReminderPreviewSchema = z.object({
  customerId: z.uuid().optional().nullable(),
  language: z.enum(['en', 'ur']).default('en'),
  channel: z.enum(REMINDER_CHANNELS).default('WHATSAPP'),
});
export type ReminderPreviewInput = z.infer<typeof ReminderPreviewSchema>;
export type ReminderPreview = { text: string; subject: string | null; segments: number; values: Record<string, string> };

/** Replaces {placeholders}; unknown or missing ones stay as written. */
export const fillPlaceholders = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);

/** SMS parts a message needs: 160 / 153 characters in GSM, 70 / 67 when it has Urdu or other non-Latin text. */
export function smsSegments(text: string): number {
  const unicode = /[^\u0000-\u007f]/.test(text);
  const [one, part] = unicode ? [70, 67] : [160, 153];
  return text.length <= one ? 1 : Math.ceil(text.length / part);
}

/** A reminder rule (Sales.PaymentReminderRules): when, on which channels, with which message, and what else happens. */
export const ReminderRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  offsetDays: z.number().int(),
  dunningLevel: z.string(),
  sendWhatsapp: z.boolean(),
  sendSms: z.boolean(),
  sendEmail: z.boolean(),
  template: z.object({ id: z.string(), name: z.string() }),
  action: z.string(),
  attachStatement: z.boolean(),
  escalate: z.boolean(),
  escalateTo: z.object({ id: z.string(), name: z.string() }).nullable(),
  applyCreditHold: z.boolean(),
  runTime: z.string(),
  isActive: z.boolean(),
  sentCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type ReminderRule = z.infer<typeof ReminderRuleSchema>;

const RuleFields = {
  name: z.string().trim().min(2, 'Name the rule').max(80),
  offsetDays: z.coerce.number().int('Whole days').min(-60, '60 days before due at most').max(365, '365 days after due at most'),
  dunningLevel: z.string().trim().min(1).max(20),
  sendWhatsapp: z.boolean().default(false),
  sendSms: z.boolean().default(false),
  sendEmail: z.boolean().default(true),
  templateId: z.uuid('Choose the message'),
  action: z.string().trim().min(1).max(20).default('MESSAGE'),
  attachStatement: z.boolean().default(false),
  escalate: z.boolean().default(false),
  escalateToUserId: z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  applyCreditHold: z.boolean().default(false),
  runTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Like 09:00').default('09:00'),
  isActive: z.boolean().default(true),
};
type RuleShape = { sendWhatsapp?: boolean; sendSms?: boolean; sendEmail?: boolean; action?: string; escalate?: boolean; escalateToUserId?: string | null };
/** Same as the DB checks: a message rule uses at least one channel; escalating needs someone to escalate to. */
export function ruleErrors(r: RuleShape): Record<string, string> {
  const e: Record<string, string> = {};
  if ((r.action ?? 'MESSAGE') === 'MESSAGE' && !r.sendWhatsapp && !r.sendSms && !r.sendEmail) e.sendEmail = 'Keep at least one channel on';
  if (r.escalate && !r.escalateToUserId) e.escalateToUserId = 'Choose who to escalate to';
  return e;
}
export const ReminderRuleCreateSchema = z.object(RuleFields).superRefine((r, ctx) => {
  for (const [path, message] of Object.entries(ruleErrors(r))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type ReminderRuleCreate = z.infer<typeof ReminderRuleCreateSchema>;
export const ReminderRuleUpdateSchema = patchFields(RuleFields).extend(RowVersionSchema.shape);
export type ReminderRuleUpdate = z.infer<typeof ReminderRuleUpdateSchema>;

/** "3 days before due" / "On due date" / "7 days after due". */
export const offsetLabel = (n: number) => (n === 0 ? 'On due date' : `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} ${n < 0 ? 'before' : 'after'} due`);
