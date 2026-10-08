import type { LookupsResponse } from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Platform-wide select values for the Super Admin portal: GET /api/admin/lookups?types=… */
export const getAdminLookups = (types: string[]) => apiRequest<LookupsResponse>(`/admin/lookups?types=${types.join(",")}`);
