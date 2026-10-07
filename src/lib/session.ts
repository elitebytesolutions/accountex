import "server-only";
import type { SessionUser } from "@/shared";
import { redirect } from "next/navigation";
import { cache } from "react";
import { me } from "@/features/auth/api.server";
import { ApiError } from "@/lib/api/errors";

/** The signed-in user, or null. Cached for the duration of one request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  try {
    return await me();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});

/** The signed-in user; redirects to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** The signed-in user holding `permission` (e.g. "mylv:view"); otherwise the "no access" page. */
export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) redirect(`/unauthorized?need=${encodeURIComponent(permission)}`);
  return user;
}
