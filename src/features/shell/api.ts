import type { ImpersonationBanner } from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Workspace side of support access (Phase 40): the live support session on this sign-in, if any, and ending it. */
export const currentSupportAccess = () => apiRequest<ImpersonationBanner | null>("/me/support-access/current");
export const endSupportAccess = () => apiRequest<void>("/me/support-access/end", { method: "POST", body: {} });
