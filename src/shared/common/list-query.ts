import { z, type ZodType } from 'zod';

/** Query string of every list endpoint: GET /api/<resource>?search&status&page&pageSize&sort */
export const ListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  /** Field name, prefixed with "-" for descending (e.g. "-createdAt"). Each resource whitelists its fields. */
  sort: z.string().regex(/^-?[A-Za-z][A-Za-z0-9]*$/, 'Invalid sort field').optional(),
});

export type ListQuery = z.infer<typeof ListQuerySchema>;

/** Response of every list endpoint. */
export const listResultSchema = <T extends ZodType>(item: T) => z.object({ items: z.array(item), total: z.number().int() });

export type ListResult<T> = { items: T[]; total: number };

/** Every update sends the rowVersion it read; a stale version is rejected with 409 CONCURRENCY_CONFLICT. */
export const RowVersionSchema = z.object({ rowVersion: z.coerce.number().int().min(0) });

type NoDefaults<S extends z.ZodRawShape> = { [K in keyof S]: S[K] extends z.ZodDefault<infer I> ? I : S[K] };
/**
 * PATCH body fields: the create fields without their defaults, all optional. Zod 4 still applies a `.default()`
 * inside `.partial()`, so a partial update would otherwise reset every omitted field to its default.
 */
export function patchFields<S extends z.ZodRawShape>(shape: S) {
  const stripped = Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v instanceof z.ZodDefault ? v.unwrap() : v])) as NoDefaults<S>;
  return z.object(stripped).partial();
}
