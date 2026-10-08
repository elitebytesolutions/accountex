import { z } from 'zod';

/** Shared field helpers of the Super Admin contracts (src/shared/platform). Blank form values become null. */
const blank = (v: unknown) => v === '' || v === undefined || v === null;

export const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
export const optNum = (min: number, max: number, msg = `${min} to ${max}`) =>
  z.preprocess((v) => (blank(v) ? null : v), z.coerce.number(msg).min(min, msg).max(max, msg).nullable());
export const optInt = (min: number, max: number, msg = `${min} to ${max}`) =>
  z.preprocess((v) => (blank(v) ? null : v), z.coerce.number(msg).int('Whole number').min(min, msg).max(max, msg).nullable());
export const optId = z.preprocess((v) => (blank(v) ? null : v), z.uuid().nullable());
export const optDate = z.preprocess((v) => (blank(v) ? null : v), z.iso.date('Use a date').nullable());
export const money = (msg = 'Not negative') => z.coerce.number(msg).min(0, msg).max(100_000_000_000);
export const lookup = (d?: string) => (d ? z.string().trim().min(1).max(40).default(d) : z.string().trim().min(1, 'Choose one').max(40));
export const rowVersion = z.coerce.number().int().min(0);

/** Adds the issues of a pure rule function ({ "field": message }) to a schema (superRefine). */
export const issues = (fn: (x: never) => Record<string, string>) => (x: unknown, ctx: z.RefinementCtx) => {
  for (const [path, message] of Object.entries(fn(x as never))) ctx.addIssue({ code: 'custom', path: path.split('.'), message });
};

/** "Each … once": an issue on `field` when two items share the same key. */
export const uniqueBy = <T>(field: string, key: (item: T) => string, message: string) => (x: unknown, ctx: z.RefinementCtx) => {
  const items = (x as Record<string, T[]>)[field] ?? [];
  if (new Set(items.map(key)).size !== items.length) ctx.addIssue({ code: 'custom', path: [field], message });
};
