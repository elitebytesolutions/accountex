import { ApiError } from "@/lib/api/errors";

/** Field errors of a failed save ({ field: first message }), for <Field error>. */
export const adminFieldErrors = (e: unknown): Record<string, string> =>
  e instanceof ApiError && e.details ? Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? ""])) : {};

/** A failed request's message for a toast. */
export const adminErrorMessage = (e: unknown, fallback: string) =>
  e instanceof ApiError ? (e.code === "DB_UNIQUE_VIOLATION" ? "That code is already used" : e.message) : fallback;
