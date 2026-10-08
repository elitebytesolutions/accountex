import type { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';

/** Platform staff names by id (Platform.PlatformStaff is not mapped in Prisma). */
export async function staffNames(prisma: PrismaService, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map();
  const rows = await prisma.db().$queryRaw<{ id: string; fullName: string }[]>`
    select id::text as id, "fullName" from "Platform"."PlatformStaff" where id = any(${list}::uuid[])`;
  return new Map(rows.map((r) => [r.id, r.fullName]));
}

/** Platform.isSoloStaff(): exactly one active platform staff member. */
export async function isSoloStaff(prisma: PrismaService): Promise<boolean> {
  const rows = await prisma.db().$queryRaw<{ solo: boolean }[]>`select "Platform"."isSoloStaff"() as solo`;
  return rows[0]?.solo ?? false;
}

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
export const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
