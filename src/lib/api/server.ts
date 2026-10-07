import "server-only";
import { cookies } from "next/headers";
import { ApiError } from "./errors";

// NestJS runs in the same process, so server components call it over loopback.
const API_BASE = `http://127.0.0.1:${process.env.PORT ?? 3000}/api`;

/** Server-side API call from server components, forwarding the user's cookies. Throws ApiError. */
export async function serverApiRequest<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store",
  });
  if (!res.ok) throw await ApiError.fromResponse(res);
  return (await res.json()) as T;
}
