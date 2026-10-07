import { ApiError } from "./errors";

type RequestOptions = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown };

/** Browser-side API call (same origin, session cookie sent automatically). Throws ApiError. */
export async function apiRequest<T>(path: string, { method = "GET", body }: RequestOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await ApiError.fromResponse(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}
