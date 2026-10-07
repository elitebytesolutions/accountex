import { ApiErrorBodySchema } from "@/shared";

/** An error response from the API, parsed from the shared ApiErrorBody shape. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
    /** Request id from the API, shown to the user as a reference for support. */
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    const parsed = ApiErrorBodySchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return new ApiError(res.status, "UNKNOWN", "Something went wrong");
    const { code, message, details } = parsed.data.error;
    return new ApiError(res.status, code, message, details, parsed.data.correlationId);
  }
}
