import type { AdminHistoryPage } from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** One platform record's history (with its child rows): GET /api/admin/history/:table/:id */
export const getAdminHistory = (table: string, id: string, page = 1, pageSize = 50) =>
  apiRequest<AdminHistoryPage>(`/admin/history/${table}/${id}?page=${page}&pageSize=${pageSize}`);
