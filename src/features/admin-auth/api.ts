import type { AdminSession, LoginInput } from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser-side Super Admin auth calls. */
export const adminLogin = (input: LoginInput) =>
  apiRequest<AdminSession>("/admin/auth/login", { method: "POST", body: input });

export const adminLogout = () => apiRequest<void>("/admin/auth/logout", { method: "POST" });
