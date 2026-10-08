import { Injectable } from '@nestjs/common';
import { TaxAuthorityGateway, type ConnectionProbe } from '../application/tax-master-store.js';

/**
 * Connection test over HTTPS: an empty signed request to the authority endpoint with the bearer token, cut off at the
 * configured timeout. The gateway answering (even rejecting the empty invoice with a 4xx) means it is reachable;
 * 401 / 403 means the token was refused; 5xx, timeouts and network errors are failures. No invoice is reported.
 */
@Injectable()
export class HttpTaxAuthorityGateway extends TaxAuthorityGateway {
  async probe(input: { endpoint: string; token: string | null; posId: string | null; timeoutMs: number }): Promise<ConnectionProbe> {
    const started = performance.now();
    const ms = () => Math.round(performance.now() - started);
    try {
      const res = await fetch(input.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(input.token && { Authorization: `Bearer ${input.token}` }),
        },
        body: JSON.stringify({ POSID: input.posId ?? undefined, Items: [] }),
        signal: AbortSignal.timeout(input.timeoutMs),
        redirect: 'manual',
      });
      await res.body?.cancel();
      if (res.status === 401 || res.status === 403) return { ok: false, ms: ms(), httpStatus: res.status, message: 'The endpoint refused the API token' };
      if (res.status >= 500) return { ok: false, ms: ms(), httpStatus: res.status, message: `The endpoint answered with an error (HTTP ${res.status})` };
      return { ok: true, ms: ms(), httpStatus: res.status, message: `Reachable · HTTP ${res.status}` };
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      return { ok: false, ms: ms(), httpStatus: null, message: timedOut ? `No answer within ${input.timeoutMs / 1000} seconds` : `Could not reach the endpoint (${e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : 'network error'})` };
    }
  }
}
