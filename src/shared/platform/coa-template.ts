import { z } from 'zod';
import { patchFields } from '../common/list-query.ts';
import { ACCOUNT_CLASSES, ACCOUNT_CODE_RE, accountLevel, parentAccountCode } from '../finance/account-code.ts';
import { optText, rowVersion } from './fields.ts';

/**
 * Phase 37: chart-of-accounts templates (Platform.ChartOfAccountsTemplates + ChartOfAccountsTemplateAccounts).
 * Tenants apply a DEFAULT or PUBLISHED template on demand (Accounting.applyChartTemplate copies the accounts).
 * Status: DRAFT → PUBLISHED ↔ RETIRED; exactly one DEFAULT (a published template the Super Admin marks as default).
 */
export const COA_TEMPLATE_STATUSES = ['DRAFT', 'PUBLISHED', 'DEFAULT', 'RETIRED'] as const;
export type CoaTemplateStatus = (typeof COA_TEMPLATE_STATUSES)[number];

export type CoaTemplateAccount = {
  id: string; code: string; name: string; parentCode: string | null; level: number; accountClass: number;
  nature: string; subType: string | null; isPostable: boolean; defaultRole: string | null;
};
export type CoaTemplate = {
  id: string; code: string; name: string; industry: string | null; version: string; status: string;
  description: string | null; icon: string | null;
  accountCount: number; postableCount: number;
  /** Tenants whose coaTemplateId points at this template. */
  tenantCount: number;
  updatedAt: string; rowVersion: number;
};
export type CoaTemplateDetail = CoaTemplate & { accounts: CoaTemplateAccount[] };

/**
 * One account of the tree editor. Level, class, parent and "postable" follow from the code (same rules as
 * Accounting.getAccountLevel / getParentAccountCode): X000 class header, XY00 header, XYZW group, XYZW-NN postable.
 */
export const CoaTemplateAccountInputSchema = z.object({
  id: z.uuid().optional(),
  code: z.string().trim().regex(ACCOUNT_CODE_RE, 'Use a code like 1110 or 1110-01'),
  name: z.string().trim().min(2, 'Name the account').max(120),
  nature: z.enum(['DR', 'CR'], 'DR or CR'),
  subType: optText(40),
  defaultRole: optText(60),
});
export type CoaTemplateAccountInput = z.infer<typeof CoaTemplateAccountInputSchema>;

/** The stored row of an account: everything derived from its code. */
export const coaAccountRow = (a: CoaTemplateAccountInput) => {
  const level = accountLevel(a.code);
  return {
    ...(a.id && { id: a.id }), code: a.code, name: a.name, nature: a.nature, subType: level === 4 ? a.subType : null, defaultRole: a.defaultRole,
    level, accountClass: Number(a.code[0]), parentCode: parentAccountCode(a.code), isPostable: level === 4,
  };
};

/**
 * Tree rules, as { "accounts.<i>.<field>": message }: unique codes, every parent present, class headers carry the
 * class's normal nature, a posting role used once, default roles and sub-types only on postable accounts.
 */
export function coaTreeErrors(accounts: CoaTemplateAccountInput[]): Record<string, string> {
  const e: Record<string, string> = {};
  const codes = new Map<string, number>();
  const roles = new Map<string, number>();
  accounts.forEach((a, i) => {
    if (codes.has(a.code)) e[`accounts.${i}.code`] = `Code ${a.code} is used twice`;
    codes.set(a.code, i);
  });
  accounts.forEach((a, i) => {
    const level = accountLevel(a.code);
    const parent = parentAccountCode(a.code);
    if (parent && !codes.has(parent)) e[`accounts.${i}.code`] ??= `Parent ${parent} is missing`;
    if (level === 1) {
      const cls = ACCOUNT_CLASSES.find((c) => c.cls === Number(a.code[0]));
      if (cls && a.nature !== cls.nature) e[`accounts.${i}.nature`] = `${cls.name} is ${cls.nature === 'DR' ? 'a debit' : 'a credit'} class`;
    }
    if (a.defaultRole) {
      if (level !== 4) e[`accounts.${i}.defaultRole`] = 'Only postable accounts take a posting role';
      else if (roles.has(a.defaultRole)) e[`accounts.${i}.defaultRole`] = `${a.defaultRole} is already on ${accounts[roles.get(a.defaultRole)!]!.code}`;
      roles.set(a.defaultRole, i);
    }
  });
  return e;
}

const CoaTemplateFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, '2–40 capital letters, digits or _ (start with a letter)'),
  name: z.string().trim().min(2, 'Name the template').max(120),
  industry: optText(60),
  version: z.string().trim().min(1, 'Give a version, e.g. v2026.1').max(20),
  description: optText(400),
  icon: optText(40),
};
/** "New template": blank, or a copy of another template's accounts (template "Template duplicated as draft"). */
export const CoaTemplateCreateSchema = z.object({ ...CoaTemplateFields, copyFromId: z.uuid().optional().nullable() });
export type CoaTemplateCreate = z.infer<typeof CoaTemplateCreateSchema>;
/** `accounts` replaces the whole tree (rows with an id are kept, missing ones removed, new ones inserted). */
export const CoaTemplateUpdateSchema = patchFields(CoaTemplateFields).extend({
  rowVersion,
  accounts: z.array(CoaTemplateAccountInputSchema).max(2000).optional(),
});
export type CoaTemplateUpdate = z.infer<typeof CoaTemplateUpdateSchema>;
export const CoaTemplateActionSchema = z.object({ rowVersion });

// ---------------------------------------------------------------- CSV import
/**
 * Template "Import from Excel": a CSV saved from Excel, header row `code, name, parentCode, level, class, nature, postable, defaultRole`
 * (an optional `subType` column is also read; columns may come in any order).
 */
export const COA_CSV_COLUMNS = ['code', 'name', 'parentCode', 'level', 'class', 'nature', 'postable', 'defaultRole'] as const;
const CSV_READ = [...COA_CSV_COLUMNS, 'subType'] as const;
export const CoaTemplateImportSchema = z.object({
  rowVersion,
  /** The API accepts JSON bodies up to 100 kB (about 1,500 accounts). */
  csv: z.string().min(1, 'Choose a CSV file').max(90_000, 'The file is too large (90 kB at most)'),
  /** Only validate and report; nothing is saved. */
  dryRun: z.boolean().default(false),
});
export type CoaTemplateImport = z.infer<typeof CoaTemplateImportSchema>;
export type CoaImportIssue = { line: number; message: string };
export type CoaImportReport = { valid: boolean; accounts: number; postable: number; issues: CoaImportIssue[]; saved: boolean };

/** Splits one CSV line (quotes, doubled quotes and commas inside quotes). */
function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const truthy = (v: string) => /^(1|y|yes|true|postable)$/i.test(v);
const falsy = (v: string) => v === '' || /^(0|n|no|false)$/i.test(v);

/**
 * Parses and validates a COA CSV: each line's columns must agree with the code (level, class, parent, postable), then
 * the tree rules run on the whole file. Issues carry the file line number (header = line 1).
 */
export function parseCoaCsv(text: string): { accounts: CoaTemplateAccountInput[]; issues: CoaImportIssue[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = csvCells(lines[0] ?? '').map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = Object.fromEntries(CSV_READ.map((c) => [c, header.indexOf(c.toLowerCase())])) as Record<(typeof CSV_READ)[number], number>;
  const issues: CoaImportIssue[] = [];
  const missing = (['code', 'name', 'nature'] as const).filter((c) => col[c] < 0);
  if (missing.length) return { accounts: [], issues: [{ line: 1, message: `Header must include ${COA_CSV_COLUMNS.join(', ')} (missing ${missing.join(', ')})` }] };

  const accounts: CoaTemplateAccountInput[] = [];
  const lineOf: number[] = [];
  lines.slice(1).forEach((raw, i) => {
    const line = i + 2;
    if (!raw.trim()) return;
    const cells = csvCells(raw);
    const get = (c: (typeof CSV_READ)[number]) => (col[c] >= 0 ? (cells[col[c]] ?? '') : '');
    const parsed = CoaTemplateAccountInputSchema.safeParse({
      code: get('code'), name: get('name'), nature: get('nature').toUpperCase(), subType: get('subType') || null, defaultRole: get('defaultRole') || null,
    });
    if (!parsed.success) {
      issues.push(...parsed.error.issues.map((x) => ({ line, message: `${String(x.path[0] ?? 'row')}: ${x.message}` })));
      return;
    }
    const a = parsed.data;
    const level = accountLevel(a.code);
    const parent = parentAccountCode(a.code);
    if (get('level') && Number(get('level')) !== level) issues.push({ line, message: `level ${get('level')} does not match code ${a.code} (level ${level})` });
    if (get('class') && Number(get('class')) !== Number(a.code[0])) issues.push({ line, message: `class ${get('class')} does not match code ${a.code} (class ${a.code[0]})` });
    if (get('parentCode') !== '' && get('parentCode') !== (parent ?? '')) issues.push({ line, message: `parentCode ${get('parentCode')} does not match code ${a.code} (parent ${parent ?? 'none'})` });
    const p = get('postable');
    if (!(falsy(p) || truthy(p))) issues.push({ line, message: `postable must be yes or no` });
    else if (p !== '' && truthy(p) !== (level === 4)) issues.push({ line, message: `only level-4 codes (like 1110-01) are postable` });
    accounts.push(a);
    lineOf.push(line);
  });
  if (!accounts.length && !issues.length) issues.push({ line: 2, message: 'The file has no accounts' });
  for (const [key, message] of Object.entries(coaTreeErrors(accounts))) {
    const i = Number(key.split('.')[1]);
    issues.push({ line: lineOf[i] ?? 0, message });
  }
  issues.sort((a, b) => a.line - b.line);
  return { accounts, issues };
}
