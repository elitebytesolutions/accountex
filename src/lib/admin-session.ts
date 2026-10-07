import "server-only";
import type { AdminSession } from "@/shared";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminMe } from "@/features/admin-auth/api.server";
import { ApiError } from "@/lib/api/errors";

/** The signed-in platform admin, or null. Cached for the duration of one request. */
export const getCurrentAdmin = cache(async (): Promise<AdminSession | null> => {
  try {
    return await adminMe();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});

/** The signed-in platform admin; redirects to /admin/login when signed out. */
export async function requireAdmin(): Promise<AdminSession> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
