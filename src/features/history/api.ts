import type { HistoryPage } from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** One record's history: GET /api/history/:schema/:table/:id */
export const getHistory = (schema: string, table: string, id: string, page = 1, pageSize = 20) =>
  apiRequest<HistoryPage>(`/history/${schema}/${table}/${id}?page=${page}&pageSize=${pageSize}`);
