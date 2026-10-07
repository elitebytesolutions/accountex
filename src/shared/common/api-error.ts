import { z } from 'zod';

/** Shape of every error response returned by the API. */
export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.array(z.string())).optional(),
  }),
  /** The request id; quote it to support so the error log entry can be found. */
  correlationId: z.string().optional(),
});

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
