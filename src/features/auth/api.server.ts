import "server-only";
import type { SessionUser } from "@/shared";
import { serverApiRequest } from "@/lib/api/server";

/** Server-side auth calls. */
export const me = () => serverApiRequest<SessionUser>("/auth/me");
