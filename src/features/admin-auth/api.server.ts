import "server-only";
import type { AdminSession } from "@/shared";
import { serverApiRequest } from "@/lib/api/server";

/** Server-side Super Admin auth calls. */
export const adminMe = () => serverApiRequest<AdminSession>("/admin/auth/me");
