import { z } from 'zod';
import { patchFields } from '../common/list-query.ts';
import { issues, optText, rowVersion } from './fields.ts';

/**
 * Phase 37: lifecycle message templates (Platform.CommunicationTemplates) in English and optional Urdu, sent by email,
 * SMS and WhatsApp (dunning, Phase 41; broadcasts, Phase 42). Bodies use {{variable}} placeholders. Sending arrives
 * with email/SMS delivery (Phase 29); until then the editor previews with sample data.
 */
export const COMM_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;
export type CommChannel = (typeof COMM_CHANNELS)[number];
/** Template variable chips (admin/comms VARS). */
export const COMM_VARIABLES = ['owner_name', 'tenant_name', 'plan', 'amount', 'due_date', 'trial_days', 'invoice_no', 'login_url'] as const;
/** Sample values of the live preview (template SAMPLE). */
export const COMM_SAMPLE: Record<'en' | 'ur', Record<string, string>> = {
  en: { owner_name: 'Ahmed Raza', tenant_name: 'Al-Noor Enterprises', plan: 'Growth', amount: 'Rs 28,999', due_date: '05 Oct 2026', trial_days: '3', invoice_no: 'AX-INV-2026-01842', login_url: 'alnoor.accountex.pk' },
  ur: { owner_name: 'احمد رضا', tenant_name: 'النور انٹرپرائزز', plan: 'گروتھ', amount: '28,999 روپے', due_date: '05 اکتوبر 2026', trial_days: '3', invoice_no: 'AX-INV-2026-01842', login_url: 'alnoor.accountex.pk' },
};

const VAR_RE = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;
/** The {{variables}} used in a text, in order of first use. */
export function templateVariables(text: string): string[] {
  return [...new Set([...text.matchAll(VAR_RE)].map((m) => m[1]!.toLowerCase()))];
}
/** Fills {{variables}} with values; unknown variables are left as written. */
export function renderTemplate(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (m, k: string) => values[k.toLowerCase()] ?? m);
}
/** SMS segments: 160 characters per segment in English (GSM-7), 70 in Urdu (UCS-2). */
export const commSmsSegments = (text: string, urdu: boolean) => Math.max(1, Math.ceil(text.length / (urdu ? 70 : 160)));

export type CommTemplate = {
  id: string; code: string; name: string; icon: string | null; channels: string[];
  subjectEn: string; bodyEn: string; subjectUr: string | null; bodyUr: string | null;
  version: number; isActive: boolean;
  /** Messages sent with this template in the last 30 days (Platform.CommunicationLogs). */
  sent30d: number;
  updatedAt: string; rowVersion: number;
};

type CommShape = { subjectEn?: string; bodyEn?: string; subjectUr?: string | null; bodyUr?: string | null };
/** Urdu is both-or-neither (commTemplateUrduChk) and every {{variable}} must be a known one. */
export function commTemplateErrors(t: CommShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (t.subjectUr !== undefined && t.bodyUr !== undefined && !t.subjectUr !== !t.bodyUr) e[t.subjectUr ? 'bodyUr' : 'subjectUr'] = 'Give both the Urdu subject and message, or neither';
  for (const f of ['subjectEn', 'bodyEn', 'subjectUr', 'bodyUr'] as const) {
    const unknown = templateVariables(t[f] ?? '').filter((v) => !(COMM_VARIABLES as readonly string[]).includes(v));
    if (unknown.length) e[f] = `Unknown variable${unknown.length > 1 ? 's' : ''} ${unknown.map((v) => `{{${v}}}`).join(', ')}`;
  }
  return e;
}

const CommFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, '2–40 capital letters, digits or _ (start with a letter)'),
  name: z.string().trim().min(2, 'Name the template').max(80),
  icon: optText(40),
  channels: z.array(z.enum(COMM_CHANNELS)).min(1, 'Pick at least one channel').max(3).transform((c) => [...new Set(c)]),
  subjectEn: z.string().trim().min(2, 'Write the subject').max(200),
  bodyEn: z.string().trim().min(2, 'Write the message').max(5000),
  subjectUr: optText(200),
  bodyUr: z.string().trim().max(5000).optional().nullable().transform((v) => (v ? v : null)),
  isActive: z.boolean().default(true),
};
export const CommTemplateCreateSchema = z.object(CommFields).superRefine(issues(commTemplateErrors));
export type CommTemplateCreate = z.infer<typeof CommTemplateCreateSchema>;
/** Cross-field rules are checked by the server on the merged record. A changed subject or body bumps `version`. */
export const CommTemplateUpdateSchema = patchFields(CommFields).extend({ rowVersion });
export type CommTemplateUpdate = z.infer<typeof CommTemplateUpdateSchema>;

/** POST /api/admin/comm-templates/:id/preview: the saved template filled with sample (or given) values. */
export const CommPreviewSchema = z.object({
  lang: z.enum(['en', 'ur']).default('en'),
  values: z.record(z.string(), z.string().max(200)).optional(),
});
export type CommPreviewInput = z.infer<typeof CommPreviewSchema>;
export type CommPreview = { lang: 'en' | 'ur'; subject: string; body: string; variables: string[]; unknownVariables: string[]; smsSegments: number };
