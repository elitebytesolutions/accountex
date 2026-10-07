import type { LoginInput, SessionUser } from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser-side auth calls. */
export const login = (input: LoginInput) =>
  apiRequest<SessionUser>("/auth/login", { method: "POST", body: input });

export const logout = () => apiRequest<void>("/auth/logout", { method: "POST" });
